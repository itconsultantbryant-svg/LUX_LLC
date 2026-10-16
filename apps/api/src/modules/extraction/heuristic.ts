import type { AiExtractionResult, ExtractedBill } from '@healthwallet/shared';
import { pageForOffset, type ParsedDocument } from './parse.js';

type Evidence = AiExtractionResult['evidence'][number];

export type HeuristicResult = {
  fields: ExtractedBill;
  evidence: Evidence[];
  /** Total computed by trusted arithmetic over extracted line items. Never model-supplied. */
  derivedTotalMinor: number | null;
  ambiguous: string[];
  unsupportedCurrency: string | null;
  injections: { quote: string; start: number; end: number }[];
};

/** Currencies the platform can transact in. Others are read but flagged, never converted. */
export const SUPPORTED_CURRENCIES = ['LRD', 'USD'] as const;

const CURRENCY_CODES = /\b(LRD|USD|EUR|GBP|NGN|GHS|SLE|GMD|XOF)\b/i;
const PROVIDER_KEYWORD =
  /(clinic|hospital|pharmacy|health\s*cent(?:er|re)|medical\s*cent(?:er|re)|diagnostic|laborator|care\s*cent(?:er|re)|dispensary)/i;
const AMOUNT = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;

/**
 * Instruction-like phrases inside an uploaded document. These are hostile data,
 * never commands: detection only records evidence and a finding, it never acts.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all)\b[^.\n]{0,40}\b(?:instruction|prompt|rule)s?\b/i,
  /\bsystem\s*prompt\b/i,
  /\byou\s+are\s+(?:now|an?)\b/i,
  /\b(?:assistant|developer)\s*:/i,
  /\b(?:authorize|approve|approve the|pay|pay the|transfer|send|release)\b[^.\n]{0,30}\b(?:payment|funds|money|balance|payout)\b/i,
  /\b(?:do\s*not|don'?t)\s+(?:tell|inform|notify|mention|disclose)\b/i,
  /\b(?:execute|run|call)\b[^.\n]{0,20}\b(?:tool|command|function|script|code)\b/i,
];

function toMinor(raw: string): number {
  const cleaned = raw.replace(/,/g, '');
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return NaN;
  return Math.round(value * 100);
}

function quoteOf(text: string, start: number, length: number): string {
  return text
    .slice(start, Math.min(text.length, start + length))
    .trim()
    .slice(0, 200);
}

function findCurrency(text: string): { code: string; index: number } | null {
  const match = CURRENCY_CODES.exec(text);
  if (!match) return null;
  return { code: match[1].toUpperCase(), index: match.index };
}

function findTotal(text: string): { minor: number; raw: string; index: number; values: number[] } {
  const values: number[] = [];
  let best: { minor: number; raw: string; index: number; weight: number } | null = null;
  const linePattern =
    /(grand\s*total|total\s*amount|total|amount\s*due|amount\s*payable|balance)/gi;
  let line: RegExpExecArray | null;
  while ((line = linePattern.exec(text)) !== null) {
    const tail = text.slice(line.index + line[0].length, line.index + line[0].length + 60);
    const amount = AMOUNT.exec(tail);
    if (!amount) continue;
    const minor = toMinor(amount[1]);
    if (Number.isNaN(minor)) continue;
    values.push(minor);
    const lower = line[1].toLowerCase();
    const weight = lower.includes('grand') ? 3 : lower.startsWith('total') ? 2 : 1;
    if (!best || weight > best.weight) {
      best = { minor, raw: amount[1], index: line.index + line[0].length + amount.index, weight };
    }
  }
  if (!best) return { minor: NaN, raw: '', index: -1, values };
  return { minor: best.minor, raw: best.raw, index: best.index, values };
}

function findDate(text: string): { value: string; index: number } | null {
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (iso) {
    const parsed = new Date(iso[1]);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso[1])
      return { value: iso[1], index: iso.index };
  }
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(text);
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    const value = `${year}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return { value, index: numeric.index };
  }
  return null;
}

function findReference(text: string): { value: string; index: number } | null {
  const match =
    /(?:invoice|bill|receipt|ref(?:erence)?)\s*(?:no|number|#)?\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9/.-]{2,})/i.exec(
      text,
    );
  if (!match) return null;
  return { value: match[1], index: match.index };
}

function findProvider(text: string): { value: string; index: number } | null {
  let offset = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && PROVIDER_KEYWORD.test(trimmed)) {
      const value = trimmed.replace(/\s{2,}/g, ' ').slice(0, 120);
      return { value, index: offset + line.indexOf(trimmed) };
    }
    offset += line.length + 1;
  }
  return null;
}

function findCustomer(text: string): { value: string; index: number } | null {
  const match = /(?:patient|customer|client|for)\s*[:-]\s*([^\n]{2,80})/i.exec(text);
  if (!match) return null;
  const value = match[1].trim();
  if (!value || PROVIDER_KEYWORD.test(value)) return null;
  return { value, index: match.index };
}

function findLineItems(text: string): { items: ExtractedBill['lineItems']; offsets: number[] } {
  const items: ExtractedBill['lineItems'] = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const pattern =
      /^(.{2,80}?)\s+(\d{1,5})\s*[x×*]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?:\s*[=:]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?))?\s*$/;
    const match = pattern.exec(line.trim());
    if (match && !/(total|subtotal|balance|amount\s*due)/i.test(match[1])) {
      const quantity = Number.parseInt(match[2], 10);
      const unitAmountMinor = toMinor(match[3]);
      const totalAmountMinor = match[4] ? toMinor(match[4]) : quantity * unitAmountMinor;
      if (quantity > 0 && !Number.isNaN(unitAmountMinor) && !Number.isNaN(totalAmountMinor)) {
        items.push({ description: match[1].trim(), quantity, unitAmountMinor, totalAmountMinor });
        offsets.push(offset);
      }
    }
    offset += line.length + 1;
  }
  return { items, offsets };
}

function detectInjections(text: string): { quote: string; start: number; end: number }[] {
  const found: { quote: string; start: number; end: number }[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match)
      found.push({
        quote: match[0].trim().slice(0, 200),
        start: match.index,
        end: match.index + match[0].length,
      });
  }
  return found;
}

export function extractFields(parsed: ParsedDocument): HeuristicResult {
  const text = parsed.text;
  const evidence: Evidence[] = [];
  const ambiguous: string[] = [];

  const add = (
    field: string,
    index: number,
    length: number,
    kind: Evidence['kind'],
    note: string,
  ) => {
    if (index < 0) return;
    evidence.push({
      field,
      note,
      kind,
      page: pageForOffset(parsed, index),
      quote: quoteOf(text, index, Math.max(length, 1) + 20),
      textSpan: { start: index, end: index + Math.max(length, 1) },
    });
  };

  const currency = findCurrency(text);
  const total = findTotal(text);
  const date = findDate(text);
  const reference = findReference(text);
  const provider = findProvider(text);
  const customer = findCustomer(text);
  const { items, offsets } = findLineItems(text);

  if (currency)
    add(
      'currency',
      currency.index,
      currency.code.length,
      'extracted',
      'Currency code read from the document.',
    );
  if (total.index >= 0)
    add(
      'totalAmountMinor',
      total.index,
      total.raw.length,
      'extracted',
      'Total amount read near a total label.',
    );
  if (date)
    add('serviceDate', date.index, date.value.length, 'extracted', 'Date read from the document.');
  if (reference)
    add(
      'billReference',
      reference.index,
      reference.value.length,
      'extracted',
      'Bill/invoice reference read.',
    );
  if (provider)
    add(
      'providerName',
      provider.index,
      provider.value.length,
      'extracted',
      'Line containing a provider keyword.',
    );
  if (customer)
    add(
      'customerName',
      customer.index,
      customer.value.length,
      'extracted',
      'Customer/patient label found.',
    );
  items.forEach((item, i) =>
    add(
      'lineItems',
      offsets[i],
      item.description.length,
      'extracted',
      'Parsed line item with quantity and price.',
    ),
  );

  const distinctTotals = [...new Set(total.values)];
  if (distinctTotals.length > 1) ambiguous.push('totalAmountMinor');

  const derivedTotalMinor = items.length
    ? items.reduce((sum, item) => sum + (item.totalAmountMinor ?? 0), 0)
    : null;

  const unsupportedCurrency =
    currency &&
    !SUPPORTED_CURRENCIES.includes(currency.code as (typeof SUPPORTED_CURRENCIES)[number])
      ? currency.code
      : null;

  const injections = detectInjections(text);
  for (const injection of injections)
    evidence.push({
      field: 'document',
      note: 'Instruction-like text inside the document — treated as untrusted content, not a command.',
      kind: 'untrusted',
      page: pageForOffset(parsed, injection.start),
      quote: injection.quote,
      textSpan: { start: injection.start, end: injection.end },
    });

  return {
    fields: {
      providerName: provider?.value ?? null,
      customerName: customer?.value ?? null,
      billReference: reference?.value ?? null,
      serviceDate: date?.value ?? null,
      currency: currency?.code ?? null,
      totalAmountMinor: total.index >= 0 ? total.minor : null,
      lineItems: items,
    },
    evidence,
    derivedTotalMinor,
    ambiguous,
    unsupportedCurrency,
    injections,
  };
}
