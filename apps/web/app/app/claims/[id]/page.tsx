"use client";
import { use, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  useData,
  useWorkspace,
  useAction,
  Feedback,
  DataBoundary,
  Status,
  money,
  date,
} from "../../../../components/workspace";
export default function ClaimDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { org, api, me } = useWorkspace();
  const { data: c, error, loading, reload } = useData("/claims/" + id);
  const action = useAction();
  const [outcome, setOutcome] = useState("APPROVED");
  const [editing, setEditing] = useState(false);
  async function decision(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    await action.run(
      `/claims/${id}/decisions`,
      { outcome, reason: d.reason, approvedMinor: d.approvedMinor },
      c.version,
    );
  }
  return (
    <>
      <div className="app-title">
        <div>
          <Link className="subtle" href="/app/claims">
            ← Claims
          </Link>
          <h1>{c?.reference || "Claim record"}</h1>
          <p>Submitted versions and insurer decisions remain traceable.</p>
        </div>
        {c && <Status value={c.state} />}
      </div>
      <Feedback action={action} />
      <DataBoundary loading={loading} error={error} retry={reload}>
        {c && (
          <div className="claim-detail-grid">
            <div>
              <section className="panel">
                <h2>Claim summary</h2>
                <dl className="key-values">
                  <div>
                    <dt>Submitted</dt>
                    <dd>{money(c.submitted_minor, c.currency)}</dd>
                  </div>
                  <div>
                    <dt>Approved payable</dt>
                    <dd>{money(c.approved_minor, c.currency)}</dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>{c.currency}</dd>
                  </div>
                  <div>
                    <dt>Submission version</dt>
                    <dd>
                      {c.submission_version} · record v{c.version}
                    </dd>
                  </div>
                </dl>
                {c.patient && (
                  <>
                    <h3>{c.patient.display_name}</h3>
                    <p>
                      Birth year: {c.patient.birth_year} · Internal patient
                      record
                    </p>
                    <h3>Eligibility snapshot</h3>
                    <p>
                      {c.eligibility.status} · {c.eligibility.source}
                      <br />
                      Checked {date(c.eligibility.checked_at)}
                    </p>
                    {c.eligibility.status !== "ACTIVE" && (
                      <div className="notice">
                        Coverage is uncertain or inactive. This is not proof of
                        eligibility.
                      </div>
                    )}
                    <h3>Encounter</h3>
                    <p>{c.encounter.diagnosis}</p>
                    <p>{c.encounter.notes}</p>
                    {c.encounter.prescription?.length > 0 && (
                      <>
                        <h3>Recorded prescriptions</h3>
                        {c.encounter.prescription.map((p: any, i: number) => (
                          <p key={i}>
                            {p.name} · {p.strength} · Dose {p.dose} · {p.route}{" "}
                            · {p.frequency} · {p.duration} · Quantity{" "}
                            {p.quantity}
                          </p>
                        ))}
                      </>
                    )}
                  </>
                )}
                {c.items.length > 0 && (
                  <>
                    <h3>Itemized bill</h3>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Service</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((i: any) => (
                            <tr key={i.id}>
                              <td>
                                {i.code}
                                <br />
                                {i.description}
                              </td>
                              <td>{i.quantity}</td>
                              <td>{money(i.unit_minor, c.currency)}</td>
                              <td>
                                {money(
                                  String(
                                    BigInt(i.unit_minor) * BigInt(i.quantity),
                                  ),
                                  c.currency,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
              {c.patient && (
                <section className="panel">
                  <h2>Validation findings</h2>
                  {c.validationRuns?.map((run: any) => (
                    <div
                      className={
                        run.processing_error ? "error-notice" : "notice"
                      }
                      key={run.id}
                    >
                      <b>{run.status.replaceAll("_", " ")}</b> · submission v
                      {run.input_version}
                      <br />
                      {run.processing_error
                        ? "Validation assistance could not complete. This processing error is not a clinical finding, rejection or approval. Human review remains required."
                        : `Rules: ${run.ruleset_version} · Model: ${run.model_version}`}
                    </div>
                  ))}
                  <p>
                    A finding asks for review. It is not a fraud verdict. Clean
                    claims also require a human insurer decision.
                  </p>
                  {c.findings.length ? (
                    c.findings.map((f: any) => (
                      <article className="finding" key={f.id}>
                        <b>
                          {f.category} · {f.field}
                        </b>
                        <p>{f.reason}</p>
                        {f.resolution && (
                          <p>
                            <b>Reviewer resolution:</b> {f.resolution}
                          </p>
                        )}
                        <small>
                          Evidence: {f.evidence} ·{" "}
                          {f.confidence === null
                            ? "No confidence score asserted"
                            : f.confidence}
                        </small>
                        {org.permissions.includes("review") &&
                          !f.resolution && (
                            <form
                              className="stack-form"
                              style={{ marginTop: 15 }}
                              onSubmit={async (e) => {
                                e.preventDefault();
                                await action.run(
                                  `/findings/${f.id}/resolutions`,
                                  Object.fromEntries(
                                    new FormData(e.currentTarget),
                                  ),
                                );
                              }}
                            >
                              <label>
                                Finding resolution
                                <select name="resolution">
                                  <option>ACCEPTED_EXPLANATION</option>
                                  <option>CONFIRMED_ERROR</option>
                                  <option>REQUIRES_INFORMATION</option>
                                  <option>NOT_SUPPORTED</option>
                                </select>
                              </label>
                              <label>
                                Resolution reason
                                <input name="reason" minLength={5} required />
                              </label>
                              <button
                                className="button secondary"
                                disabled={action.busy}
                              >
                                Record finding resolution
                              </button>
                            </form>
                          )}
                      </article>
                    ))
                  ) : (
                    <p>
                      No recorded findings for this claim. This is not approval.
                    </p>
                  )}
                </section>
              )}
              {c.patient && (
                <section className="panel">
                  <h2>Private evidence</h2>
                  <p>
                    Files stay quarantined until content, size and malware
                    checks succeed. Every download is authorized again.
                  </p>
                  {c.attachments?.length ? (
                    c.attachments.map((a: any) => (
                      <div className="notification" key={a.id}>
                        <b>{a.document_type}</b> ·{" "}
                        <Status value={a.scan_state} />
                        <small>
                          {a.content_type} · {a.size_bytes} bytes
                        </small>
                        {a.scan_state === "CLEAN" && (
                          <button
                            className="inline-button"
                            onClick={async () => {
                              try {
                                const result = await api(
                                  `/attachments/${a.id}/download`,
                                  { method: "POST", body: "{}" },
                                );
                                window.open(
                                  result.url,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              } catch (e) {
                                action.setMessage(
                                  e instanceof Error
                                    ? e.message
                                    : "Download could not be authorized.",
                                );
                              }
                            }}
                          >
                            Open authorized document
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p>No attachments recorded.</p>
                  )}
                </section>
              )}
              <section className="panel">
                <h2>Decision history</h2>
                {c.decisions.length ? (
                  c.decisions.map((d: any) => (
                    <article className="notification" key={d.id}>
                      <Status value={d.outcome} />
                      <p>{d.reason}</p>
                      <p>Approved: {money(d.approved_minor, c.currency)}</p>
                      <small>{date(d.created_at)}</small>
                    </article>
                  ))
                ) : (
                  <p>No insurer decision has been recorded.</p>
                )}
              </section>
            </div>
            <div>
              {org.type === "FACILITY" &&
                org.permissions.includes("claims") &&
                c.state === "DRAFT" && (
                  <section className="panel">
                    <h2>Submit for review</h2>
                    <p>
                      Submission freezes an immutable version and queues
                      validation. The insurer must still review the claim.
                    </p>
                    <button
                      className="button"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(`/claims/${id}/submit`, {}, c.version)
                      }
                    >
                      Submit claim
                    </button>
                  </section>
                )}
              {org.type === "FACILITY" &&
                org.permissions.includes("claims") &&
                ["DRAFT", "NEEDS_INFORMATION"].includes(c.state) && (
                  <section className="panel">
                    <h2>Revise bill items</h2>
                    <p>Earlier submitted evidence is retained.</p>
                    <form
                      className="stack-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const d = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        try {
                          await action.run(
                            `/claims/${id}/corrections`,
                            {
                              reason: d.reason,
                              items: JSON.parse(String(d.items)),
                            },
                            c.version,
                          );
                        } catch {
                          action.setMessage("Items must be valid JSON.");
                        }
                      }}
                    >
                      <label>
                        Reason
                        <input name="reason" minLength={5} required />
                      </label>
                      <label>
                        Bill items (minor units)
                        <textarea
                          className="code-input"
                          name="items"
                          defaultValue={JSON.stringify(
                            c.items.map((i: any) => ({
                              code: i.code,
                              description: i.description,
                              quantity: i.quantity,
                              unitMinor: i.unit_minor,
                            })),
                            null,
                            2,
                          )}
                        />
                      </label>
                      <button
                        className="button secondary"
                        disabled={action.busy}
                      >
                        Save revised draft
                      </button>
                    </form>
                  </section>
                )}
              {org.permissions.includes("review") &&
                c.state === "AWAITING_REVIEW" && (
                  <section className="panel">
                    <h2>Insurer human decision</h2>
                    <button
                      className="inline-button"
                      onClick={() =>
                        action.run(`/claims/${id}/assignments`, {
                          reviewerId: me.user.id,
                        })
                      }
                    >
                      Assign this review to me
                    </button>
                    <form className="stack-form" onSubmit={decision}>
                      <label>
                        Decision
                        <select
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                        >
                          {[
                            "APPROVED",
                            "PARTIALLY_APPROVED",
                            "NEEDS_INFORMATION",
                            "REJECTED",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Approved amount ({c.currency} minor units)
                        <input
                          name="approvedMinor"
                          inputMode="numeric"
                          pattern="[0-9]+"
                          defaultValue={c.submitted_minor}
                          required
                        />
                        <small>
                          Use 0 for rejection or a correction request.
                        </small>
                      </label>
                      <label>
                        Reason
                        <textarea
                          name="reason"
                          required
                          minLength={5}
                          rows={4}
                        />
                      </label>
                      <button className="button" disabled={action.busy}>
                        Record decision
                      </button>
                    </form>
                  </section>
                )}
              {org.permissions.includes("payments.authorize") &&
                ["APPROVED", "PARTIALLY_APPROVED"].includes(c.state) && (
                  <section className="panel">
                    <h2>Request payment authorization</h2>
                    <p>
                      Fees are snapshotted from the configured policy. A
                      separate finance identity must check this request. No
                      funds move now.
                    </p>
                    <form
                      className="stack-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const d = Object.fromEntries(
                          new FormData(e.currentTarget),
                        );
                        await action.run(
                          `/claims/${id}/payment-authorizations`,
                          { amountMinor: d.amountMinor, reason: d.reason },
                          c.version,
                        );
                      }}
                    >
                      <label>
                        Base amount ({c.currency} minor units)
                        <input
                          name="amountMinor"
                          required
                          pattern="[0-9]+"
                          defaultValue={c.approved_minor}
                        />
                      </label>
                      <label>
                        Authorization reason
                        <textarea name="reason" minLength={5} required />
                      </label>
                      <button className="button" disabled={action.busy}>
                        Reserve & request authorization
                      </button>
                      <Link className="text-link" href="/app/payments">
                        View fee breakdown and approvals →
                      </Link>
                    </form>
                  </section>
                )}
              {org.type === "FACILITY" &&
                ["PARTIALLY_APPROVED", "REJECTED"].includes(c.state) && (
                  <section className="panel">
                    <h2>Appeal the decision</h2>
                    <form
                      className="stack-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await action.run(`/claims/${id}/appeals`, {
                          reason: new FormData(e.currentTarget).get("reason"),
                        });
                      }}
                    >
                      <label>
                        Appeal reason
                        <textarea name="reason" minLength={10} required />
                      </label>
                      <button
                        className="button secondary"
                        disabled={action.busy}
                      >
                        Record appeal
                      </button>
                    </form>
                  </section>
                )}
              {org.type === "FACILITY" &&
                org.permissions.includes("claims") &&
                [
                  "DRAFT",
                  "SUBMITTED",
                  "AWAITING_REVIEW",
                  "NEEDS_INFORMATION",
                ].includes(c.state) && (
                  <section className="panel">
                    <h2>Withdraw this claim</h2>
                    <p>
                      Only available before a conflicting decision or payment.
                      Submitted evidence is retained.
                    </p>
                    <form
                      className="stack-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await action.run(
                          `/claims/${id}/withdraw`,
                          {
                            reason: new FormData(e.currentTarget).get("reason"),
                          },
                          c.version,
                        );
                      }}
                    >
                      <label>
                        Withdrawal reason
                        <input name="reason" minLength={5} required />
                      </label>
                      <button
                        className="button secondary"
                        disabled={action.busy}
                      >
                        Record withdrawal
                      </button>
                    </form>
                  </section>
                )}
              <section className="panel">
                <h2>Traceable history</h2>
                <ol className="timeline">
                  {c.timeline.map((t: any, i: number) => (
                    <li key={i}>
                      {t.action.replace(/([A-Z])/g, " $1")}
                      <small>{date(t.created_at)}</small>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        )}
      </DataBoundary>
    </>
  );
}
