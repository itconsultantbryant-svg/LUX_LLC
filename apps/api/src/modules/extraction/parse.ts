import { inflateSync, inflateRawSync } from 'node:zlib';

export type ParsedDocument = {
  /** Concatenated, page-ordered text. */
  text: string;
  /** One entry per page (text/plain and unreadable documents have a single page). */
  pages: string[];
  unreadable: boolean;
  /** Machine-readable reason when `unreadable` is true. */
  reason: string | null;
  pageCount: number;
};

const MIN_MEANINGFUL_CHARS = 12;

function printableRatio(value: string): number {
  if (!value.length) return 0;
  let printable = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) printable += 1;
  }
  return printable / value.length;
}

/** Heuristic binary sniff: NUL bytes or mostly non-printable content. */
export function looksBinary(value: string): boolean {
  if (value.includes('\u0000')) return true;
  return printableRatio(value) < 0.85;
}

function decodePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (next === 'n') {
      out += '\n';
      i += 1;
    } else if (next === 'r') {
      out += '\r';
      i += 1;
    } else if (next === 't') {
      out += '\t';
      i += 1;
    } else if (next === '(' || next === ')' || next === '\\') {
      out += next;
      i += 1;
    } else if (next >= '0' && next <= '7') {
      let octal = '';
      let j = i + 1;
      while (j < raw.length && octal.length < 3 && raw[j] >= '0' && raw[j] <= '7') {
        octal += raw[j];
        j += 1;
      }
      out += String.fromCharCode(Number.parseInt(octal, 8));
      i = j - 1;
    } else {
      out += next;
      i += 1;
    }
  }
  return out;
}

/** Pull human-readable strings out of a decoded PDF content stream. */
function textFromContentStream(content: string): string {
  let out = '';
  const literal = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(content)) !== null) out += `${decodePdfString(match[1])}\n`;
  const array = /\[((?:\\.|[^[\]])*)\]\s*TJ/g;
  while ((match = array.exec(content)) !== null) {
    const inner = match[1];
    const parts = /\(((?:\\.|[^\\()])*)\)/g;
    let part: RegExpExecArray | null;
    let line = '';
    while ((part = parts.exec(inner)) !== null) line += decodePdfString(part[1]);
    if (line) out += `${line}\n`;
  }
  return out;
}

function extractPdfStreams(bytes: Buffer): string[] {
  const streams: string[] = [];
  const haystack = bytes.toString('latin1');
  const pattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(haystack)) !== null) {
    const header = haystack.slice(Math.max(0, match.index - 260), match.index);
    const raw = Buffer.from(match[1], 'latin1');
    let decoded = raw;
    if (/FlateDecode/.test(header)) {
      try {
        decoded = inflateSync(raw);
      } catch {
        try {
          decoded = inflateRawSync(raw);
        } catch {
          continue;
        }
      }
    }
    const text = textFromContentStream(decoded.toString('latin1'));
    if (text.trim()) streams.push(text.trim());
  }
  return streams;
}

export function extractText(bytes: Buffer, contentType: string): ParsedDocument {
  const type = contentType.toLowerCase();
  if (type === 'text/plain') {
    const text = bytes.toString('utf8');
    if (looksBinary(text) || text.trim().length < MIN_MEANINGFUL_CHARS)
      return {
        text: '',
        pages: [],
        unreadable: true,
        reason: 'unreadable_text',
        pageCount: 0,
      };
    return { text, pages: [text], unreadable: false, reason: null, pageCount: 1 };
  }
  if (type === 'application/pdf') {
    const pages = extractPdfStreams(bytes);
    const text = pages.join('\n');
    if (text.replace(/\s+/g, '').length < MIN_MEANINGFUL_CHARS)
      return {
        text: '',
        pages: [],
        unreadable: true,
        reason: 'no_extractable_text',
        pageCount: 0,
      };
    return {
      text,
      pages: pages.length ? pages : [text],
      unreadable: false,
      reason: null,
      pageCount: pages.length || 1,
    };
  }
  if (type.startsWith('image/'))
    return {
      text: '',
      pages: [],
      unreadable: true,
      reason: 'image_ocr_unavailable',
      pageCount: 0,
    };
  return {
    text: '',
    pages: [],
    unreadable: true,
    reason: 'unsupported_content_type',
    pageCount: 0,
  };
}

/** Map a character offset in `text` back to a 1-based page number. */
export function pageForOffset(parsed: Pick<ParsedDocument, 'pages'>, offset: number): number {
  let cursor = 0;
  for (let i = 0; i < parsed.pages.length; i += 1) {
    const length = parsed.pages[i].length + 1;
    if (offset < cursor + length) return i + 1;
    cursor += length;
  }
  return Math.max(1, parsed.pages.length);
}
