import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { formatMinor } from '../lib/money';
import { prepareDocument, type Invoice } from '../lib/provider';
import { Feedback } from './Feedback';
import { InvoiceEditor } from './InvoiceEditor';
import { webConfig } from '../config';
type Revision = {
  revision: number;
  reference: string;
  issue_date: string;
  provider_name: string;
  currency: string;
  items: Invoice['items'];
  total_minor: string;
  confirmation_kind: string;
  requires_documents: boolean;
  reason: string;
  created_at: string;
};
type Extraction = {
  reviewedAt: string | null;
  unreadable: boolean | null;
  requiresReview: boolean;
  ambiguous: string[];
  extractedFields: Record<string, unknown> | null;
  confidenceBps: number | null;
  adapterId: string | null;
  findings: { id: string; code: string; severity: string; message: string; field: string | null }[];
  corrections: { id: string; field: string; corrected_value: unknown; reason: string | null }[];
};
type Validation = {
  hasRun: boolean;
  route: string | null;
  overall: string | null;
  customerStatus: string | null;
  customerStatusLabel: string | null;
  policyVersion: string | null;
  modelVersion: string | null;
  findings: {
    check_name: string;
    label: string;
    result: string;
    severity: string;
    source: string;
    evidence: Record<string, unknown>;
    missing_info: string[];
    recommended_action: string;
  }[];
};
type FundingSource = {
  allocationId: string;
  source: string;
  label: string;
  availableMinor: string;
  eligible: boolean;
  restricted: boolean;
  blockReason: string | null;
};
type Assistance = {
  plan: {
    currency: string;
    billAmountMinor: string;
    totalEligibleMinor: string;
    allocatedMinor: string;
    shortfallMinor: string;
    eligibleSavingsMinor: string;
    eligibleContributionsMinor: string;
    eligibleVouchersMinor: string;
    otherEligibleMinor: string;
    eligibleInsuranceMinor: string;
    insurance: { available: boolean; amountMinor: string; reason: string };
    sources: FundingSource[];
    actions: { action: string; available: boolean; reason: string }[];
    restrictions: string[];
    policyVersion: string;
    planVersion: string;
    simulationLabel: string | null;
  };
  supportRequests: { id: string; kind: string; status: string; reason: string }[];
  financingInquiries: { id: string; status: string; amount_minor: string; currency: string }[];
  planVersion: string;
};
const EXTRACTED_FIELDS = [
  'providerName',
  'customerName',
  'billReference',
  'serviceDate',
  'currency',
  'totalAmountMinor',
] as const;
type Detail = {
  bill: {
    id: string;
    customer_user_id: string;
    provider_name: string;
    category: string;
    status: string;
  };
  customer: boolean;
  revisions: Revision[];
  documents: { id: string; content_type: string; revision_number: number | null }[];
  confirmations: { id: string; revision: number; kind: string; note: string }[];
  payments: {
    id: string;
    status: string;
    amount_minor: number;
    currency: string;
    adapter_mode: string;
  }[];
  receipts: { id: string; number: string; currency: string; amount_minor: string }[];
  disputes: { id: string; status: string; reason: string }[];
  corrections: { id: string; status: string; reason: string }[];
  changes: unknown[];
};
export function BillWorkspace({
  id,
  institution = false,
  onChange,
}: {
  id: string;
  institution?: boolean;
  onChange?: () => void;
}) {
  const [data, setData] = useState<Detail>();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<'amend' | 'correction' | null>(null);
  const [document, setDocument] = useState<
    Awaited<ReturnType<typeof prepareDocument>> & { revision: number }
  >();
  const [evidence, setEvidence] = useState('');
  const [note, setNote] = useState('');
  const [dispute, setDispute] = useState('');
  const [receipt, setReceipt] = useState<{
    number: string;
    amount_minor: string;
    currency: string;
    adapter_mode: string;
  }>();
  const [extraction, setExtraction] = useState<Extraction>();
  const [validation, setValidation] = useState<Validation>();
  const [assistance, setAssistance] = useState<Assistance>();
  const [supportReason, setSupportReason] = useState('');
  const [corr, setCorr] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    setError('');
    apiGet<Detail>(`/api/care/bills/${id}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, version]);
  useEffect(() => {
    if (!data?.customer) return;
    let active = true;
    apiGet<Extraction>(`/api/care/bills/${id}/extraction`)
      .then((e) => {
        if (active) setExtraction(e);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, version, data?.customer]);
  useEffect(() => {
    if (!data) return;
    let active = true;
    apiGet<Validation>(`/api/bills/${id}/validation`)
      .then((v) => {
        if (active) setValidation(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, version, data]);
  useEffect(() => {
    if (!data?.customer) return;
    let active = true;
    apiGet<Assistance>(`/api/bills/${id}/assistance`)
      .then((v) => {
        if (active) setAssistance(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, version, data?.customer]);
  async function act(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setVersion((v) => v + 1);
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function once(path: string, body: Record<string, unknown>) {
    const signature = path + JSON.stringify(body);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    const value = await apiPost<{ message?: string }>(path, { ...body, key });
    keys.current.delete(signature);
    return value;
  }
  const current = data?.revisions[0];
  const docs = data?.documents.filter((d) => d.revision_number === current?.revision) ?? [];
  const initial: Invoice | undefined = current
    ? {
        reference: current.reference,
        issueDate: current.issue_date,
        currency: current.currency,
        category: data!.bill.category,
        items: current.items,
        requiresDocuments: current.requires_documents,
        confirmationKind: current.confirmation_kind,
      }
    : undefined;
  return (
    <article className="panel bill-workspace">
      <h2>Bill details</h2>
      {!data && !error && <Feedback kind="loading" title="Loading the bill and its history…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <button className="btn btn--ghost" onClick={() => setVersion((v) => v + 1)}>
            Refresh bill
          </button>
          <Link className="text-link" to="/account/security">
            Check sign-in and MFA
          </Link>
        </Feedback>
      )}
      {notice && <Feedback kind="success" title={notice} />}{' '}
      {busy && <Feedback kind="loading" title="Saving your request…" />}
      {data && (
        <>
          <p>
            Provider: <strong>{data.bill.provider_name}</strong>
          </p>
          {institution && (
            <p>
              Associated customer record: {data.bill.customer_user_id}. Association was authorized
              by the customer; do not reassign this bill.
            </p>
          )}
          <p>Bill status: {data.bill.status}</p>
          {!current ? (
            <Feedback kind="unavailable" title="Legacy bill">
              <p>
                This bill has no versioned invoice. It cannot proceed to live payment. Submit a
                dispute if a correction is needed.
              </p>
            </Feedback>
          ) : (
            <>
              <h3>
                {current.reference} · version {current.revision}
              </h3>
              <p>
                Issued {current.issue_date} · {current.currency}
              </p>
              <ul className="activity-list">
                {current.items.map((i, n) => (
                  <li key={n}>
                    <div>
                      <strong>{i.description}</strong>
                      <p>
                        {i.quantity} × {formatMinor(i.unitMinor, current.currency)}
                      </p>
                    </div>
                    <strong>
                      {formatMinor(
                        (BigInt(i.quantity) * BigInt(i.unitMinor)).toString(),
                        current.currency,
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="balance">Total {formatMinor(current.total_minor, current.currency)}</p>
              <p>
                Required evidence:{' '}
                {current.confirmation_kind === 'service'
                  ? 'Service delivery'
                  : 'Invoice authenticity'}
                . Supporting documents {current.requires_documents ? 'required' : 'optional'}.
              </p>
              <h3>Validation</h3>
              <p>
                AI compares the document with the bill and flags inconsistencies. It cannot
                establish, from a bill alone, whether treatment actually occurred.
              </p>
              {validation?.hasRun ? (
                <>
                  <p>
                    Status: <strong>{validation.customerStatusLabel}</strong>
                  </p>
                  <p>
                    Policy {validation.policyVersion} · rules {validation.modelVersion}. The
                    customer-facing status is separate from financial authorization; a completed
                    validation is not a payment guarantee.
                  </p>
                  <ul className="activity-list">
                    {validation.findings.map((f) => (
                      <li key={f.check_name}>
                        <div>
                          <strong>{f.label}</strong>
                          <p>
                            {f.result} · {f.severity} · {f.source}
                          </p>
                          {f.missing_info.length > 0 && <p>Missing: {f.missing_info.join(', ')}</p>}
                          {f.recommended_action && <p>{f.recommended_action}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await apiPost(`/api/bills/${id}/validate`, {});
                        setNotice('Bill re-checked against the current validation policy.');
                      })
                    }
                  >
                    Re-run validation
                  </button>
                </>
              ) : (
                <button
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await apiPost(`/api/bills/${id}/validate`, {});
                      setNotice('Bill checked. Review any missing information below.');
                    })
                  }
                >
                  Check this bill
                </button>
              )}
              <h3>Funding</h3>
              <p>
                Eligible funds are calculated from your approved records. This is a hold, not a
                payment, and it is not proof of settlement.
              </p>
              {!assistance && data.customer && (
                <Feedback kind="loading" title="Checking funding…" />
              )}
              {assistance && (
                <>
                  {assistance.plan.simulationLabel && (
                    <p role="note">
                      <strong>{assistance.plan.simulationLabel}</strong>
                    </p>
                  )}
                  <p>
                    Bill {formatMinor(assistance.plan.billAmountMinor, assistance.plan.currency)} ·
                    eligible{' '}
                    {formatMinor(assistance.plan.totalEligibleMinor, assistance.plan.currency)} ·
                    held {formatMinor(assistance.plan.allocatedMinor, assistance.plan.currency)} ·
                    shortfall{' '}
                    <strong>
                      {formatMinor(assistance.plan.shortfallMinor, assistance.plan.currency)}
                    </strong>
                  </p>
                  <p>
                    Insurance:{' '}
                    {assistance.plan.insurance.available
                      ? formatMinor(assistance.plan.insurance.amountMinor, assistance.plan.currency)
                      : 'no verified coverage found'}{' '}
                    — {assistance.plan.insurance.reason}
                  </p>
                  {assistance.plan.sources.length > 0 && (
                    <ul className="activity-list">
                      {assistance.plan.sources.map((s) => (
                        <li key={s.allocationId}>
                          <div>
                            <strong>{s.label}</strong>
                            <p>
                              {formatMinor(s.availableMinor, assistance.plan.currency)} ·{' '}
                              {s.eligible ? 'eligible' : `not eligible (${s.blockReason})`}
                              {s.restricted ? ' · restricted' : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {assistance.plan.actions.find((x) => x.action === 'use_funds')?.available && (
                    <button
                      className="btn btn--primary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const value = await apiPost<{ message?: string }>(
                            `/api/bills/${id}/assistance/apply`,
                            { key: crypto.randomUUID() },
                          );
                          setNotice(value.message ?? 'Eligible funds reserved.');
                        })
                      }
                    >
                      Reserve eligible funds
                    </button>
                  )}
                  {assistance.plan.sources
                    .filter((s) => s.source === 'sponsor_vouchers' && s.eligible)
                    .map((s) => (
                      <button
                        key={s.allocationId}
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const value = await apiPost<{ message?: string }>(
                              `/api/bills/${id}/assistance/voucher`,
                              { key: crypto.randomUUID(), voucherAllocationId: s.allocationId },
                            );
                            setNotice(value.message ?? 'Voucher applied.');
                          })
                        }
                      >
                        Apply voucher
                      </button>
                    ))}
                  {assistance.plan.actions.find((x) => x.action === 'request_support')
                    ?.available && (
                    <div>
                      <textarea
                        aria-label="Support request reason"
                        placeholder="Explain what you need help with"
                        value={supportReason}
                        onChange={(e) => setSupportReason(e.target.value)}
                      />
                      <button
                        className="btn btn--ghost"
                        disabled={busy || supportReason.trim().length < 8}
                        onClick={() =>
                          void act(async () => {
                            const value = await apiPost<{ message?: string }>(
                              `/api/bills/${id}/assistance/support`,
                              {
                                kind: 'shortfall_support',
                                amountMinor: assistance.plan.shortfallMinor,
                                reason: supportReason,
                              },
                            );
                            setSupportReason('');
                            setNotice(value.message ?? 'Support requested.');
                          })
                        }
                      >
                        Request support for the shortfall
                      </button>
                    </div>
                  )}
                  {assistance.plan.actions.find((x) => x.action === 'request_help')?.available && (
                    <button
                      className="btn btn--ghost"
                      disabled={busy || supportReason.trim().length < 8}
                      onClick={() =>
                        void act(async () => {
                          const value = await apiPost<{ message?: string }>(
                            `/api/bills/${id}/assistance/support`,
                            { kind: 'help', reason: supportReason },
                          );
                          setSupportReason('');
                          setNotice(value.message ?? 'Help requested.');
                        })
                      }
                    >
                      Request help
                    </button>
                  )}
                  {assistance.supportRequests.length > 0 && (
                    <p>
                      Support:{' '}
                      {assistance.supportRequests.map((s) => `${s.kind} (${s.status})`).join(', ')}
                    </p>
                  )}
                  {assistance.financingInquiries.length > 0 && (
                    <p>
                      Financing inquiries:{' '}
                      {assistance.financingInquiries
                        .map((f) => `${formatMinor(f.amount_minor, f.currency)} (${f.status})`)
                        .join(', ')}
                    </p>
                  )}
                  {assistance.plan.restrictions.map((r) => (
                    <p key={r} className="muted">
                      {r}
                    </p>
                  ))}
                </>
              )}
              <h3>Current-version confirmations</h3>
              {data.confirmations
                .filter((c) => c.revision === current.revision)
                .map((c) => (
                  <p key={c.id}>
                    {c.kind}: recorded · {c.note}
                  </p>
                ))}
              {!data.confirmations.some((c) => c.revision === current.revision) && (
                <p>No confirmations recorded yet.</p>
              )}
              <h3>Supporting documents</h3>
              {!docs.length && <p>No documents attached to this version.</p>}
              {data.documents.map((d) => (
                <p key={d.id}>
                  <a
                    className="text-link"
                    href={`${webConfig.apiBaseUrl}/api/documents/${d.id}/download`}
                  >
                    Download {d.content_type} · version {d.revision_number ?? 'legacy'}
                  </a>
                </p>
              ))}
              <label htmlFor={`bill-file-${id}`}>
                Photograph or upload a bill or supporting evidence
              </label>
              <input
                id={`bill-file-${id}`}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                capture="environment"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void act(async () => {
                      setDocument({ ...(await prepareDocument(f)), revision: current.revision });
                      setNotice('Document prepared locally. Check readability before uploading.');
                    });
                  e.target.value = '';
                }}
              />
              {document && (
                <div>
                  {document.preview && (
                    <img
                      src={document.preview}
                      alt="Selected document preview — check that the text is readable"
                      style={{ maxWidth: '100%', maxHeight: 400 }}
                    />
                  )}
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await apiPost(`/api/bills/${id}/documents`, {
                          contentType: document.contentType,
                          base64: document.base64,
                          expectedRevision: document.revision,
                        });
                        setDocument(undefined);
                        setNotice('Document uploaded privately and linked to this version.');
                      })
                    }
                  >
                    Upload reviewed document
                  </button>
                </div>
              )}
              {institution && (
                <form
                  className="app-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      await apiPost(`/api/provider/bills/${id}/confirm`, {
                        expectedRevision: current.revision,
                        evidenceDocumentId: evidence,
                        note,
                      });
                      setNotice('Provider confirmation recorded with evidence.');
                    });
                  }}
                >
                  <h3>Provider evidence confirmation</h3>
                  <p>
                    Confirm only after checking the external invoice or service-delivery evidence.
                    An AI extraction is not a confirmation.
                  </p>
                  <label htmlFor={`evidence-${id}`}>Evidence for this version</label>
                  <select
                    id={`evidence-${id}`}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    required
                  >
                    <option value="">Select uploaded evidence</option>
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.content_type} · {d.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`confirmation-note-${id}`}>What was checked and how?</label>
                  <textarea
                    id={`confirmation-note-${id}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    minLength={8}
                    maxLength={2000}
                    required
                  />
                  <button className="btn btn--primary" disabled={busy || !docs.length}>
                    Confirm{' '}
                    {current.confirmation_kind === 'service'
                      ? 'service delivery'
                      : 'invoice authenticity'}
                  </button>
                </form>
              )}
              {data.customer && extraction?.requiresReview && !extraction.reviewedAt && (
                <form
                  className="app-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      const extracted = extraction.extractedFields ?? {};
                      const corrections = EXTRACTED_FIELDS.filter(
                        (field) =>
                          corr[field] !== undefined &&
                          corr[field] !== String(extracted[field] ?? ''),
                      ).map((field) => ({
                        field,
                        value:
                          corr[field] === ''
                            ? null
                            : field === 'totalAmountMinor'
                              ? Number(corr[field])
                              : corr[field],
                      }));
                      await once(`/api/care/bills/${id}/extraction-review`, { corrections });
                      setCorr({});
                      setNotice('Extracted fields confirmed. You can now request payment.');
                    });
                  }}
                >
                  <h3>Check the extracted bill fields</h3>
                  <p>
                    Extraction is a suggestion, not a verified fact. Correct anything wrong; your
                    corrections are kept with the original values.
                  </p>
                  {extraction.unreadable && (
                    <Feedback kind="unavailable" title="We could not read this document">
                      <p>Nothing was guessed. Enter the details below or upload a clearer copy.</p>
                    </Feedback>
                  )}
                  <p>
                    Confidence{' '}
                    {extraction.confidenceBps == null
                      ? 'unknown'
                      : `${Math.round(extraction.confidenceBps / 100)}%`}{' '}
                    · reader {extraction.adapterId}
                  </p>
                  {extraction.ambiguous.length > 0 && (
                    <p>Please confirm these ambiguous fields: {extraction.ambiguous.join(', ')}.</p>
                  )}
                  {extraction.findings.map((f) => (
                    <p key={f.id}>
                      {f.severity}: {f.message}
                    </p>
                  ))}
                  {EXTRACTED_FIELDS.map((field) => (
                    <div key={field}>
                      <label htmlFor={`ex-${field}`}>{field}</label>
                      <input
                        id={`ex-${field}`}
                        value={corr[field] ?? String(extraction.extractedFields?.[field] ?? '')}
                        disabled={busy}
                        onChange={(e) => setCorr((c) => ({ ...c, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button className="btn btn--primary" disabled={busy}>
                    Confirm extracted fields
                  </button>
                </form>
              )}
              {extraction?.reviewedAt && (
                <p>
                  Extracted fields confirmed by you on{' '}
                  {new Date(extraction.reviewedAt).toLocaleString()}
                  {extraction.corrections.length > 0
                    ? ` · ${extraction.corrections.length} correction(s) retained`
                    : ''}
                  .
                </p>
              )}
              {data.customer && (
                <div className="button-row">
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await apiPost(`/api/care/bills/${id}/confirm`, {
                          expectedRevision: current.revision,
                          accepted: true,
                        });
                        setNotice(
                          'You accepted this provider, currency, items and total. No money moved.',
                        );
                      })
                    }
                  >
                    I reviewed the provider and amount
                  </button>
                  <button
                    className="btn btn--ghost"
                    disabled={busy || (extraction?.requiresReview && !extraction.reviewedAt)}
                    onClick={() =>
                      void act(async () => {
                        const r = await once(`/api/care/bills/${id}/payment-request`, {
                          expectedRevision: current.revision,
                        });
                        setNotice(r.message ?? 'Payment request recorded.');
                      })
                    }
                  >
                    Continue to payment request
                  </button>
                </div>
              )}
              <div className="button-row">
                {institution && !data.payments.length && (
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setEditing('amend')}
                  >
                    Amend bill with history
                  </button>
                )}
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setEditing('correction')}
                >
                  Submit correction for review
                </button>
              </div>
              {editing && initial && (
                <div>
                  <h3>
                    {editing === 'amend' ? 'Create a new version' : 'Propose corrected items'}
                  </h3>
                  <p>
                    {editing === 'amend'
                      ? 'Prior versions and evidence remain preserved. The new version requires fresh confirmations.'
                      : 'This creates a review request. It does not change or reverse the original bill or payment.'}
                  </p>
                  <InvoiceEditor
                    key={`${id}-${current.revision}-${editing}`}
                    initial={initial}
                    busy={busy}
                    reasonRequired
                    correctionOnly={editing === 'correction'}
                    label={editing === 'amend' ? 'Save new version' : 'Submit correction'}
                    onSubmit={(invoice, reason) =>
                      void act(async () => {
                        await once(
                          editing === 'amend'
                            ? `/api/provider/bills/${id}/amend`
                            : `/api/care/bills/${id}/corrections`,
                          {
                            expectedRevision: current.revision,
                            reason,
                            ...(editing === 'amend' ? { invoice } : { items: invoice.items }),
                          },
                        );
                        setEditing(null);
                        setNotice(
                          editing === 'amend'
                            ? 'New version saved; earlier history preserved.'
                            : 'Correction submitted for review.',
                        );
                      })
                    }
                  />
                  <button className="btn btn--ghost" onClick={() => setEditing(null)}>
                    Cancel edit
                  </button>
                </div>
              )}
              <details>
                <summary>Bill version history ({data.revisions.length})</summary>
                {data.revisions.map((r) => (
                  <section key={r.revision}>
                    <h4>
                      Version {r.revision} · {r.reference} ·{' '}
                      {formatMinor(r.total_minor, r.currency)}
                    </h4>
                    <p>
                      {r.reason} · {new Date(r.created_at).toLocaleString()}
                    </p>
                    <ul>
                      {r.items.map((i, n) => (
                        <li key={n}>
                          {i.description} · {i.quantity} × {formatMinor(i.unitMinor, r.currency)}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <p>{data.changes.length} database change records retained.</p>
              </details>
            </>
          )}
          <h3>Payment status and receipts</h3>
          {!data.payments.length && (
            <p>No payment request yet. A bill or ledger reservation is not proof of payment.</p>
          )}
          {data.payments.map((p) => (
            <p key={p.id}>
              {formatMinor(String(p.amount_minor), p.currency)} · {p.status}{' '}
              {p.adapter_mode === 'sandbox' ? '· SIMULATION' : ''}
            </p>
          ))}
          {!data.receipts.length && (
            <p>No issued payment receipt. Receipts require confirmed settlement.</p>
          )}
          {data.receipts.map((r) => (
            <button
              className="btn btn--ghost"
              key={r.id}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const response = await apiGet<{ receipt: NonNullable<typeof receipt> }>(
                    `/api/care/receipts/${r.id}`,
                  );
                  setReceipt(response.receipt);
                  setNotice('Authorized receipt retrieved.');
                })
              }
            >
              Retrieve receipt {r.number}
            </button>
          ))}
          {receipt && (
            <p>
              Receipt {receipt.number} · {formatMinor(receipt.amount_minor, receipt.currency)} ·{' '}
              {receipt.adapter_mode}
            </p>
          )}
          <form
            className="app-form"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await once(`/api/care/bills/${id}/disputes`, { reason: dispute });
                setDispute('');
                setNotice(
                  'Dispute submitted. Unresolved disputes block new live payment processing.',
                );
              });
            }}
          >
            <label htmlFor={`dispute-${id}`}>Dispute reason</label>
            <textarea
              id={`dispute-${id}`}
              value={dispute}
              onChange={(e) => setDispute(e.target.value)}
              minLength={8}
              maxLength={2000}
              required
            />
            <button className="btn btn--ghost" disabled={busy}>
              Submit dispute
            </button>
          </form>
          {data.disputes.map((d) => (
            <p key={d.id}>
              Dispute {d.status}: {d.reason}
            </p>
          ))}
          {data.corrections.map((c) => (
            <p key={c.id}>
              Correction {c.status}: {c.reason}
            </p>
          ))}
        </>
      )}
    </article>
  );
}
