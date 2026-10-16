import { useId, useState } from 'react';
import { decimalMinor, formatMinor } from '../lib/money';
import type { Invoice } from '../lib/provider';
import { Feedback } from './Feedback';
export function InvoiceEditor({
  initial,
  onSubmit,
  busy,
  label = 'Create itemized bill',
  reasonRequired = false,
  correctionOnly = false,
}: {
  initial?: Invoice;
  onSubmit: (invoice: Invoice, reason: string) => void;
  busy: boolean;
  label?: string;
  reasonRequired?: boolean;
  correctionOnly?: boolean;
}) {
  const prefix = useId();
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [date, setDate] = useState(initial?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState(initial?.currency ?? 'LRD');
  const [category, setCategory] = useState(initial?.category ?? 'general');
  const [rows, setRows] = useState(
    (initial?.items ?? [{ description: '', quantity: 1, unitMinor: '0' }]).map((i) => ({
      id: crypto.randomUUID(),
      description: i.description,
      quantity: String(i.quantity),
      price: `${BigInt(i.unitMinor) / 100n}.${(BigInt(i.unitMinor) % 100n).toString().padStart(2, '0')}`,
    })),
  );
  const [kind, setKind] = useState(initial?.confirmationKind ?? 'invoice');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  function items() {
    return rows.map((r) => {
      if (!/^[1-9]\d{0,4}$/.test(r.quantity) || Number(r.quantity) > 10000)
        throw Error('Use whole-unit quantities from 1 to 10,000.');
      return {
        description: r.description,
        quantity: Number(r.quantity),
        unitMinor: /^0(\.0{1,2})?$/.test(r.price) ? '0' : decimalMinor(r.price),
      };
    });
  }
  let sum: string | null = null;
  try {
    sum = items()
      .reduce((n, i) => n + BigInt(i.quantity) * BigInt(i.unitMinor), 0n)
      .toString();
  } catch {
    /* Invalid intermediate form input is explained on submit. */
  }
  return (
    <form
      className="app-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const value = items();
          if (BigInt(sum ?? '0') <= 0n) throw Error('The total must be positive.');
          setError('');
          onSubmit(
            {
              reference,
              issueDate: date,
              currency,
              category,
              items: value,
              requiresDocuments: true,
              confirmationKind: kind,
            },
            reason,
          );
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label htmlFor={`${prefix}-invoice-reference`}>Bill reference</label>
      <input
        id={`${prefix}-invoice-reference`}
        disabled={correctionOnly}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        maxLength={80}
        required
      />
      <label htmlFor={`${prefix}-invoice-date`}>Issue date</label>
      <input
        id={`${prefix}-invoice-date`}
        type="date"
        disabled={correctionOnly}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <label htmlFor={`${prefix}-invoice-currency`}>Currency</label>
      <select
        id={`${prefix}-invoice-currency`}
        value={currency}
        disabled={!!initial}
        onChange={(e) => setCurrency(e.target.value)}
      >
        <option>LRD</option>
        <option>USD</option>
      </select>
      <label htmlFor={`${prefix}-invoice-category`}>Care category</label>
      <select
        id={`${prefix}-invoice-category`}
        disabled={correctionOnly}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {['general', 'consultation', 'medication', 'diagnostics'].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {rows.map((r, index) => (
        <fieldset key={r.id}>
          <legend>Line item {index + 1}</legend>
          <label htmlFor={`description-${r.id}`}>Description</label>
          <input
            id={`description-${r.id}`}
            value={r.description}
            maxLength={300}
            required
            onChange={(e) =>
              setRows((v) =>
                v.map((x) => (x.id === r.id ? { ...x, description: e.target.value } : x)),
              )
            }
          />
          <label htmlFor={`quantity-${r.id}`}>Quantity (whole units)</label>
          <input
            id={`quantity-${r.id}`}
            inputMode="numeric"
            value={r.quantity}
            required
            onChange={(e) =>
              setRows((v) => v.map((x) => (x.id === r.id ? { ...x, quantity: e.target.value } : x)))
            }
          />
          <label htmlFor={`price-${r.id}`}>Unit price ({currency})</label>
          <input
            id={`price-${r.id}`}
            inputMode="decimal"
            value={r.price}
            required
            onChange={(e) =>
              setRows((v) => v.map((x) => (x.id === r.id ? { ...x, price: e.target.value } : x)))
            }
          />
          {rows.length > 1 && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => setRows((v) => v.filter((x) => x.id !== r.id))}
            >
              Remove item {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn--ghost"
        disabled={busy || rows.length >= 100}
        onClick={() =>
          setRows((v) => [
            ...v,
            { id: crypto.randomUUID(), description: '', quantity: '1', price: '0.00' },
          ])
        }
      >
        Add line item
      </button>
      <p role="status">
        Calculated total: {sum ? formatMinor(sum, currency) : 'Check quantities and prices'}. The
        server recalculates this total.
      </p>
      <label htmlFor={`${prefix}-confirmation-kind`}>Required provider evidence</label>
      <select
        id={`${prefix}-confirmation-kind`}
        disabled={correctionOnly}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        <option value="invoice">Invoice authenticity</option>
        <option value="service">Service delivery</option>
      </select>
      <p>
        Supporting documents are required. A provider must confirm the selected evidence, and the
        customer must review this version before continuing.
      </p>
      {reasonRequired && (
        <>
          <label htmlFor={`${prefix}-invoice-reason`}>Reason for amendment or correction</label>
          <textarea
            id={`${prefix}-invoice-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={8}
            maxLength={2000}
            required
          />
        </>
      )}
      <button className="btn btn--primary" disabled={busy}>
        {label}
      </button>
      {error && <Feedback kind="error" title={error} />}
    </form>
  );
}
