"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { DemoPaymentConfirmation } from "./demo-payment-confirmation";
import {
  useWorkspace,
  useData,
  useAction,
  Feedback,
  DataBoundary,
  Empty,
  Status,
  money,
  date,
} from "./workspace";
function RecordTable({
  rows,
  linkClaim = false,
}: {
  rows: any[];
  linkClaim?: boolean;
}) {
  if (!rows.length) return <Empty />;
  const keys = Object.keys(rows[0])
    .filter(
      (k) =>
        ![
          "id",
          "claim_id",
          "insurer_id",
          "facility_id",
          "created_by",
          "edited_by",
          "token_hash",
          "policy_id",
          "fee_snapshot",
          "destination_snapshot",
        ].includes(k),
    )
    .slice(0, 8);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {keys.map((k) => (
                <td key={k}>
                  {k === "reference" && linkClaim ? (
                    <Link href={"/app/claims/" + (r.claim_id || r.id)}>
                      {r[k]}
                    </Link>
                  ) : r[k] === null ? (
                    "—"
                  ) : typeof r[k] === "object" ? (
                    JSON.stringify(r[k])
                  ) : (
                    String(r[k])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ModuleTitle({ title, text }: { title: string; text?: string }) {
  return (
    <div className="app-title">
      <div>
        <h1>{title}</h1>
        <p>
          {text ||
            "Records are restricted to your active organization and permissions."}
        </p>
      </div>
    </div>
  );
}
export function PaymentsModule() {
  const { org } = useWorkspace();
  const q = useData("/payments");
  const action = useAction();
  const [selected, setSelected] = useState<any>(null);
  const p = selected && q.data?.find((v: any) => v.id === selected);
  return (
    <>
      <ModuleTitle
        title="Payments & authorizations"
        text="Approval, authorization, processing and settlement are separate facts."
      />
      <Feedback action={action} />
      <DataBoundary {...q} retry={q.reload}>
        {q.data?.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Claim</th>
                    <th>Base</th>
                    <th>State</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((v: any) => (
                    <tr key={v.id}>
                      <td>
                        <Link href={"/app/claims/" + v.claim_id}>
                          {v.claim_reference}
                        </Link>
                      </td>
                      <td>{money(v.base_minor, v.currency)}</td>
                      <td>
                        <Status value={v.state} />
                      </td>
                      <td>{v.mode.toUpperCase()}</td>
                      <td>{v.provider_reference || "Not confirmed"}</td>
                      <td>
                        <button
                          className="inline-button"
                          onClick={() => setSelected(v.id)}
                        >
                          Review details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {p && (
              <section className="panel" style={{ marginTop: 24 }}>
                <h2>Authorization breakdown</h2>
                <p>
                  {p.claim_reference} ·{" "}
                  {p.mode === "demo"
                    ? "SIMULATED PAYMENT — NO REAL FUNDS"
                    : p.mode.toUpperCase()}
                </p>
                <span className="badge">
                  Fee incidence: {p.fee_snapshot.mode.replaceAll("_", " ")}
                </span>
                <div className="payment-split">
                  {[
                    ["Base payment", p.base_minor],
                    ["Insurer debit", p.fee_snapshot.insurerDebit],
                    ["Facility net", p.fee_snapshot.facilityNet],
                    ["Total service fee (2%)", p.fee_snapshot.total],
                    ["LUX allocation (1% of base)", p.fee_snapshot.lux],
                    ["Orange allocation (1% of base)", p.fee_snapshot.orange],
                  ].map(([k, v]) => (
                    <div key={k}>
                      {k}
                      <strong>{money(v, p.currency)}</strong>
                    </div>
                  ))}
                </div>
                <p>
                  Fee payer:{" "}
                  {p.fee_snapshot.mode === "INSURER_ADDED"
                    ? "insurer (added to base)"
                    : "facility (deducted from base)"}
                  . Destination snapshot: {p.destination_snapshot.reference} ·
                  version {p.destination_snapshot.version}
                </p>
                <div className="notice">
                  Assessed allocation is not proof of cash distribution. LUX
                  earned revenue excludes Orange’s share and facility principal.
                  No Orange Money PIN is requested.
                </div>
                <div className="button-row">
                  {org.permissions.includes("payments.authorize") &&
                    p.state === "AWAITING_AUTHORIZATION" && (
                      <button
                        className="button"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(`/payments/${p.id}/approve`, {}, p.version)
                        }
                      >
                        Check & authorize
                      </button>
                    )}
                  {org.permissions.includes("payments.execute") &&
                    [
                      "PROCESSING",
                      "AWAITING_FUNDS",
                      "UNKNOWN_PENDING_INVESTIGATION",
                    ].includes(p.state) && (
                      <button
                        className="button secondary"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(`/payments/${p.id}/status-check`, {})
                        }
                      >
                        Queue status inquiry — not a retry
                      </button>
                    )}
                  <button
                    className="inline-button"
                    onClick={() => setSelected(null)}
                  >
                    Close details
                  </button>
                </div>
                {org.permissions.includes("payments.execute") &&
                  p.state === "AUTHORIZED" &&
                  p.mode === "demo" && (
                    <DemoPaymentConfirmation key={p.id} payment={p} />
                  )}
                {org.permissions.includes("payments.authorize") &&
                  [
                    "AWAITING_AUTHORIZATION",
                    "AUTHORIZED",
                    "AWAITING_FUNDS",
                  ].includes(p.state) && (
                    <form
                      className="stack-form"
                      style={{ marginTop: 20 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await action.run(
                          `/payments/${p.id}/cancel`,
                          {
                            reason: new FormData(e.currentTarget).get("reason"),
                          },
                          p.version,
                        );
                      }}
                    >
                      <label>
                        Cancellation reason
                        <input name="reason" minLength={5} required />
                      </label>
                      <button
                        className="button secondary"
                        disabled={action.busy}
                      >
                        Cancel only if not dispatched
                      </button>
                      <small>
                        Once dispatched, provider confirmation is required;
                        reservations are not released on uncertainty.
                      </small>
                    </form>
                  )}
                <p className="subtle" style={{ marginTop: 18 }}>
                  A separate finance identity must authorize a maker’s request.
                  A timeout retains its reservation until a reliable final
                  result is confirmed.
                </p>
              </section>
            )}
          </>
        ) : (
          !q.loading && <Empty />
        )}
      </DataBoundary>
    </>
  );
}
export function EligibilityModule() {
  const patients = useData("/patients"),
    contracts = useData("/contracts");
  const action = useAction();
  const [snapshot, setSnapshot] = useState<any>(null);
  return (
    <>
      <ModuleTitle
        title="Patients & eligibility"
        text="Coverage comes from authorized insurer records. Unknown or stale is never proof of eligibility."
      />
      <Feedback action={action} />
      <section className="panel">
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget));
            setSnapshot(await action.run("/eligibility-checks", d));
          }}
        >
          <label>
            Facility patient
            <select name="patientId" required>
              <option value="">Choose an authorized patient</option>
              {patients.data?.map((p: any) => (
                <option value={p.id} key={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contracted insurer
            <select name="insurerId" required>
              <option value="">Choose insurer</option>
              {contracts.data?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={action.busy}>
            Check coverage
          </button>
        </form>
      </section>
      {snapshot && (
        <section className="panel" role="status">
          <h2>Eligibility snapshot</h2>
          <Status value={snapshot.status} />
          <dl className="key-values">
            <div>
              <dt>Source</dt>
              <dd>{snapshot.source}</dd>
            </div>
            <div>
              <dt>Checked at</dt>
              <dd>{date(snapshot.checked_at)}</dd>
            </div>
            <div>
              <dt>Source last updated</dt>
              <dd>
                {snapshot.source_updated_at
                  ? date(snapshot.source_updated_at)
                  : "Not supplied"}
              </dd>
            </div>
            <div>
              <dt>Policy reference</dt>
              <dd>{snapshot.policy_reference || "Not available"}</dd>
            </div>
          </dl>
          <p>Benefits and limitations: {JSON.stringify(snapshot.benefits)}</p>
          <div className="notice">
            {snapshot.status === "ACTIVE"
              ? "Active coverage snapshot is not an insurer claim decision."
              : "Coverage is uncertain or inactive. Confirm with the insurer before relying on this result."}
          </div>
        </section>
      )}
      <DataBoundary {...patients} retry={patients.reload}>
        {patients.data && <RecordTable rows={patients.data} />}
      </DataBoundary>
    </>
  );
}
export function ReconciliationModule() {
  const q = useData("/reconciliation/exceptions");
  const action = useAction();
  const [preview, setPreview] = useState<any>(null);
  const [raw, setRaw] = useState(
    '[\n  {"reference":"DEMO-PROVIDER-7","amountMinor":"100000","currency":"USD","destination":"DEMO-DEST-facility"}\n]',
  );
  return (
    <>
      <ModuleTitle
        title="Reconciliation"
        text="An imported reference is not payment confirmation. Ambiguous records are never matched automatically."
      />
      <Feedback action={action} />
      <section className="panel">
        <h2>Preview a settlement-record import</h2>
        <p>
          JSON rows use integer minor units. Preview reports duplicate
          references, unmatched records, wrong amount, destination and currency.
          No state is marked paid.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setPreview(
                await action.run("/reconciliation/imports", {
                  rows: JSON.parse(raw),
                  confirm: false,
                }),
              );
            } catch {
              action.setMessage("Import must be a valid JSON array.");
            }
          }}
        >
          <label>
            Settlement rows
            <textarea
              className="code-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
          <button className="button secondary" disabled={action.busy}>
            Stage preview
          </button>
        </form>
        {preview && (
          <>
            <p>Checksum: {preview.checksum}</p>
            <p>
              {preview.matches.length} exact matches · {preview.errors.length}{" "}
              row errors
            </p>
            <RecordTable rows={preview.errors} />
            <button
              className="button"
              disabled={action.busy}
              onClick={async () => {
                const r = await action.run("/reconciliation/imports", {
                  rows: JSON.parse(raw),
                  confirm: true,
                });
                if (r) setPreview(null);
              }}
            >
              Confirm import with exception records
            </button>
          </>
        )}
      </section>
      <DataBoundary {...q} retry={q.reload}>
        {q.data?.map((r: any) => (
          <section className="panel" key={r.id}>
            <h2>{r.category.replaceAll("_", " ")}</h2>
            <Status value={r.status} />
            <p>{r.notes}</p>
            {r.status !== "RESOLVED" && (
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await action.run(
                    `/exceptions/${r.id}/resolve`,
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                }}
              >
                <label>
                  Resolution notes
                  <textarea name="notes" minLength={10} required />
                </label>
                <label>
                  Resolution evidence
                  <textarea name="evidence" minLength={10} required />
                </label>
                <button className="button secondary" disabled={action.busy}>
                  Record resolution evidence
                </button>
                <small>
                  Resolving an exception does not change payment settlement.
                </small>
              </form>
            )}
          </section>
        ))}
        {q.data?.length === 0 && (
          <Empty title="No open reconciliation records." />
        )}
      </DataBoundary>
    </>
  );
}
export function TeamModule() {
  const q = useData("/admin/team");
  const action = useAction();
  return (
    <>
      <ModuleTitle
        title="Team content"
        text="Only approved biographies and real supplied portraits are published."
      />
      <Feedback action={action} />
      <DataBoundary {...q} retry={q.reload}>
        {q.data?.map((m: any) => (
          <section key={m.id} className="panel">
            <h2>{m.name}</h2>
            {m.admin_note && (
              <div className="notice">Admin only: {m.admin_note}</div>
            )}
            <form
              className="stack-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget));
                let contacts;
                const field = e.currentTarget.elements.namedItem(
                  "contacts",
                ) as HTMLTextAreaElement;
                try {
                  contacts = JSON.parse(String(d.contacts || "[]"));
                } catch {
                  field.setCustomValidity(
                    "Enter a valid JSON array of approved contact links.",
                  );
                  field.reportValidity();
                  return;
                }
                await action.run(
                  "/admin/team/" + m.id,
                  {
                    ...d,
                    bio: d.bio || null,
                    photo: d.photo || null,
                    alt: d.alt || null,
                    published: d.published === "on",
                    contacts,
                  },
                  undefined,
                  "PATCH",
                );
              }}
            >
              <div className="form-grid">
                <label>
                  Name
                  <input name="name" defaultValue={m.name} required />
                </label>
                <label>
                  Role
                  <input name="role" defaultValue={m.role} required />
                </label>
                <label>
                  Approved photo path
                  <input name="photo" defaultValue={m.photo || ""} />
                </label>
                <label>
                  Accessible photo description
                  <input name="alt" defaultValue={m.alt || ""} />
                </label>
                <label className="full">
                  Approved biography
                  <textarea name="bio" defaultValue={m.bio || ""} rows={3} />
                </label>
                <label className="full">
                  Approved social and contact links
                  <textarea
                    name="contacts"
                    className="code-input"
                    defaultValue={JSON.stringify(m.contacts || [], null, 2)}
                    onChange={(e) => e.currentTarget.setCustomValidity("")}
                  />
                  <small>
                    Approved entries only: kind (email, phone, linkedin,
                    facebook, instagram, website or x), value, optional label.
                    Keep [] when no details have been supplied. Do not invent
                    profiles.
                  </small>
                </label>
              </div>
              <label className="consent">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={m.published}
                />
                <span>Publish this approved team record</span>
              </label>
              <button className="button secondary" disabled={action.busy}>
                Save team content
              </button>
            </form>
          </section>
        ))}
      </DataBoundary>
    </>
  );
}
export function ContentModule() {
  const q = useData("/admin/content");
  const action = useAction();
  const [preview, setPreview] = useState<any>(null);
  return (
    <>
      <ModuleTitle
        title="Public content"
        text="Structured plain-text content. React output encoding prevents executable HTML."
      />
      <Feedback action={action} />
      <section className="panel">
        <h2>Create a version</h2>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget));
            const content = {
              title: d.title,
              intro: d.intro,
              sections: [{ title: d.heading, text: d.text }],
            };
            if (d.status === "PREVIEW") {
              setPreview(content);
              return;
            }
            await action.run("/admin/content", {
              slug: d.slug,
              status: d.status,
              content,
            });
          }}
        >
          <label>
            Page slug
            <select name="slug">
              {[
                "home",
                "faq",
                "services",
                "about",
                "partners",
                "privacy",
                "terms",
                "accessibility",
              ].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required />
          </label>
          <label>
            Introduction
            <textarea name="intro" required />
          </label>
          <label>
            Section heading
            <input name="heading" required />
          </label>
          <label>
            Section text
            <textarea name="text" required rows={6} />
          </label>
          <label>
            Action
            <select name="status">
              <option value="PREVIEW">Preview (no changes)</option>
              <option value="DRAFT">Save draft</option>
              <option value="PUBLISHED">Publish approved content</option>
            </select>
          </label>
          <button className="button" disabled={action.busy}>
            Continue
          </button>
        </form>
      </section>
      {preview && (
        <section className="panel">
          <span className="badge">UNPUBLISHED PREVIEW</span>
          <h2>{preview.title}</h2>
          <p>{preview.intro}</p>
          {preview.sections.map((s: any, i: number) => (
            <div key={i}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </section>
      )}
      <h2 style={{ fontSize: 22 }}>Version history</h2>
      <DataBoundary {...q} retry={q.reload}>
        {q.data && <RecordTable rows={q.data} />}
      </DataBoundary>
    </>
  );
}
export function UsersModule() {
  const q = useData("/users");
  const { org } = useWorkspace();
  const action = useAction();
  return (
    <>
      <ModuleTitle title="Organization users" />
      <Feedback action={action} />
      <section className="panel">
        <h2>Invite a colleague</h2>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget));
            const r = await action.run("/invitations", {
              email: d.email,
              roles: [d.role],
            });
            if (r?.link)
              action.setMessage(`Development-only invitation link: ${r.link}`);
            else if (r)
              action.setMessage(
                `Invitation recorded. Delivery status: ${r.delivery}`,
              );
          }}
        >
          <label>
            Work email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role">
              {(org.type === "FACILITY"
                ? [
                    "FACILITY_ADMIN",
                    "FACILITY_CLINICIAN",
                    "FACILITY_CLAIMS",
                    "FACILITY_FINANCE",
                  ]
                : [
                    "INSURER_ADMIN",
                    "INSURER_REVIEWER",
                    "INSURER_FINANCE",
                    "INSURER_AUDITOR",
                  ]
              ).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button className="button" disabled={action.busy}>
            Create invitation
          </button>
        </form>
      </section>
      <DataBoundary {...q} retry={q.reload}>
        {q.data && <RecordTable rows={q.data} />}
        <div className="panel">
          {q.data
            ?.filter((m: any) => m.status === "ACTIVE")
            .map((m: any) => (
              <div className="notification" key={m.id}>
                {m.name} · {m.email}{" "}
                <button
                  className="inline-button"
                  onClick={() => action.run(`/users/${m.id}/revoke`, {})}
                >
                  Revoke membership
                </button>
              </div>
            ))}
        </div>
      </DataBoundary>
    </>
  );
}
export function SettingsModule() {
  const action = useAction();
  const { org } = useWorkspace();
  const [totp, setTotp] = useState<any>(null),
    [msg, setMsg] = useState("");
  return (
    <>
      <ModuleTitle title="Settings & security" />
      <Feedback action={action} />
      <section className="panel">
        <h2>Authenticator-based MFA</h2>
        <p>
          Privileged non-demo access requires MFA. Enrol with your own
          authenticator; the secret is never sent to a third-party QR service.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await authClient.twoFactor.enable({
              password: String(new FormData(e.currentTarget).get("password")),
            });
            if (r.error) setMsg(r.error.message || "Unable to enable MFA");
            else setTotp(r.data);
          }}
        >
          <label>
            Current password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button secondary">Start MFA enrollment</button>
        </form>
        {totp && (
          <>
            <p>
              Enter this setup URI in your authenticator (sensitive; keep
              private):
            </p>
            <p style={{ overflowWrap: "anywhere" }}>{totp.totpURI}</p>
            <p>Store these one-use recovery codes securely:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {totp.backupCodes?.join("\n")}
            </pre>
            <form
              className="stack-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await authClient.twoFactor.verifyTotp({
                  code: String(new FormData(e.currentTarget).get("code")),
                });
                setMsg(
                  r.error
                    ? r.error.message || "Verification failed"
                    : "MFA verified.",
                );
                if (!r.error) setTotp(null);
              }}
            >
              <label>
                Authenticator code
                <input
                  name="code"
                  pattern="[0-9]{6}"
                  required
                  autoComplete="one-time-code"
                />
              </label>
              <button className="button">Verify enrollment</button>
            </form>
          </>
        )}
        {msg && <p role="status">{msg}</p>}
      </section>
      {org.permissions.includes("destination") && (
        <section className="panel">
          <h2>Request destination change</h2>
          <p>
            Changes require a different checker, a fresh session and independent
            destination verification. Non-demo verification remains blocked
            until a provider is approved.
          </p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await action.run(
                "/destination-changes",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
            }}
          >
            <label>
              Proposed destination reference
              <input name="reference" minLength={6} required />
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={10} required />
            </label>
            <button className="button secondary" disabled={action.busy}>
              Record change request
            </button>
          </form>
        </section>
      )}
    </>
  );
}
export function ReportsModule({ fees = false }: { fees?: boolean }) {
  const { org } = useWorkspace();
  const [type, setType] = useState("claims"),
    [currency, setCurrency] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const filters = {
    ...(currency ? { currency } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const query = new URLSearchParams(filters).toString();
  const q = useData("/reports/" + (fees ? "fees" : type) + "?" + query);
  const [err, setErr] = useState("");
  async function download(pdf = false) {
    try {
      const r = await fetch(
        "/api/v1/" + (pdf ? "statements/pdf?" + query : "exports"),
        {
          method: pdf ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Organization-ID": org.id,
          },
          ...(pdf
            ? {}
            : {
                body: JSON.stringify({ type: fees ? "fees" : type, filters }),
              }),
        },
      );
      if (!r.ok) throw Error("Export could not be authorized or generated.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = pdf ? "lux-statement.pdf" : "lux-report.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    }
  }
  return (
    <>
      <ModuleTitle
        title={fees ? "LUX fee revenue" : "Reports & statements"}
        text="Never combine currencies. Accrued fees are not confirmed allocation settlement."
      />
      <div className="toolbar">
        {!fees && (
          <label>
            Report
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                ["claims", "Claim totals"],
                ["aging", "Claim aging"],
                ["review-turnaround", "Insurer review turnaround"],
                ["payment-latency", "Payment settlement latency"],
                ["submission-quality", "Submission quality"],
                ["exceptions", "Exception aging"],
                ["statement", "Partner statement"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">All — separate totals</option>
            <option>USD</option>
            <option>LRD</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {err && (
        <p role="alert" className="error-notice">
          {err}
        </p>
      )}
      <div className="button-row" style={{ marginBottom: 24 }}>
        <button className="button secondary" onClick={() => download()}>
          Export authorized CSV
        </button>
        {!fees && (
          <button className="button secondary" onClick={() => download(true)}>
            Download PDF statement
          </button>
        )}
      </div>
      <DataBoundary {...q} retry={q.reload}>
        {q.data && (
          <>
            <div className="notice">{q.data.basis}</div>
            <RecordTable rows={q.data.rows} />
            {fees && (
              <div className="notice">
                Cash allocated to LUX and Orange is recorded separately in
                verified fee-settlement records. No allocation collection is
                assumed from a calculated split.
              </div>
            )}
          </>
        )}
      </DataBoundary>
    </>
  );
}
export function SupportModule() {
  const action = useAction();
  return (
    <>
      <ModuleTitle title="Support" />
      <Feedback action={action} />
      <section className="panel">
        <h2>Open a support request</h2>
        <p>
          Operational details only. Do not include raw medical information,
          passwords or PINs.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await action.run(
              "/support",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
          }}
        >
          <label>
            Subject
            <input name="subject" minLength={5} required />
          </label>
          <label>
            What do you need help with?
            <textarea name="message" rows={5} minLength={10} required />
          </label>
          <button className="button" disabled={action.busy}>
            Record support request
          </button>
        </form>
      </section>
    </>
  );
}
export function EncountersModule() {
  const q = useData("/encounters");
  const patients = useData("/patients");
  const { org } = useWorkspace();
  const action = useAction();
  return (
    <>
      <ModuleTitle
        title="Encounter records"
        text="Clinicians author documentation. Claims staff can use authorized records without acquiring prescribing or insurer decision authority."
      />
      <Feedback action={action} />
      {org.permissions.includes("encounters.write") && (
        <section className="panel">
          <h2>Record an encounter</h2>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await action.run("/encounters", {
                  patientId: d.patientId,
                  serviceDate: d.serviceDate,
                  diagnosis: d.diagnosis,
                  notes: d.notes,
                  prescription: JSON.parse(String(d.prescription)),
                });
              } catch {
                action.setMessage(
                  "Prescriptions must be a valid structured JSON array.",
                );
              }
            }}
          >
            <label>
              Authorized patient
              <select name="patientId" required>
                <option value="">Select patient</option>
                {patients.data?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Service date
              <input type="date" name="serviceDate" required />
            </label>
            <label>
              Diagnosis
              <input name="diagnosis" minLength={3} required />
            </label>
            <label>
              Clinical notes
              <textarea name="notes" minLength={3} required rows={4} />
            </label>
            <label>
              Recorded prescriptions — structured entries
              <textarea
                className="code-input"
                name="prescription"
                defaultValue="[]"
              />
              <small>
                Each entry: name, strength, dose, route, frequency, duration and
                integer quantity. Leave [] if none. LUX does not recommend
                treatment.
              </small>
            </label>
            <button className="button" disabled={action.busy}>
              Save clinical record
            </button>
          </form>
        </section>
      )}
      <DataBoundary {...q} retry={q.reload}>
        {q.data && <RecordTable rows={q.data} />}
      </DataBoundary>
    </>
  );
}
export function GenericModule({ section }: { section: string }) {
  const admin = [
    "organization-requests",
    "organizations",
    "integrations",
    "jobs",
    "enquiries",
  ].includes(section);
  const path =
    section === "returned"
      ? "/claims?state=NEEDS_INFORMATION"
      : (admin ? "/admin/" : "/") + section;
  const q = useData(path);
  const action = useAction();
  const titles: Record<string, string> = {
    "organization-requests": "Organization requests",
    organizations: "Organizations",
    integrations: "Integration health",
    jobs: "Validation & durable work",
    enquiries: "Public enquiries",
    encounters: "Encounter records",
    contracts: "Contracted organizations",
    coverage: "Coverage & tariffs",
    decisions: "Decisions & appeals",
    flagged: "Flagged claims",
    returned: "Returned claims",
    audit: "Audit history",
  };
  const rows = Array.isArray(q.data)
    ? q.data
    : q.data?.data || q.data?.tariffs || q.data?.decisions || [];
  return (
    <>
      <ModuleTitle title={titles[section] || section} />
      <Feedback action={action} />
      {section === "integrations" && (
        <div className="notice">
          Orange Money live business disbursement and event verification are not
          configured. No official marks or endorsements are implied. Secret
          values never appear here.
        </div>
      )}
      {section === "jobs" && (
        <div className="notice">
          Jobs persist in PostgreSQL. DEAD jobs require investigation; do not
          replay an uncertain payment as a new transfer.
        </div>
      )}
      {section === "flagged" && (
        <div className="notice">
          Possible inconsistency is not a confirmed error or a fraud verdict.
        </div>
      )}
      <DataBoundary {...q} retry={q.reload}>
        <RecordTable
          rows={rows}
          linkClaim={["flagged", "returned", "decisions"].includes(section)}
        />
        {section === "organization-requests" &&
          rows
            .filter((r: any) => r.status === "PENDING")
            .map((r: any) => (
              <section className="panel" key={r.id}>
                <h2>Review: {r.organization}</h2>
                <p>
                  {r.email} · {r.kind}. Approval creates an active organization
                  only through this authorized action.
                </p>
                <form
                  className="stack-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await action.run(
                      `/admin/organization-requests/${r.id}/approve`,
                      { reason: new FormData(e.currentTarget).get("reason") },
                    );
                  }}
                >
                  <label>
                    Approval rationale
                    <textarea name="reason" required minLength={10} />
                  </label>
                  <button className="button" disabled={action.busy}>
                    Approve organization access
                  </button>
                </form>
              </section>
            ))}
        {section === "decisions" &&
          q.data?.appeals?.map((r: any) => (
            <section className="panel" key={r.id}>
              <h2>Appeal: {r.reference}</h2>
              <p>{r.reason}</p>
              <Status value={r.status} />
              {r.status === "OPEN" && (
                <form
                  className="stack-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await action.run(`/appeals/${r.id}/resolve`, {
                      resolution: new FormData(e.currentTarget).get(
                        "resolution",
                      ),
                    });
                  }}
                >
                  <label>
                    Review resolution
                    <textarea name="resolution" minLength={10} required />
                  </label>
                  <button className="button secondary" disabled={action.busy}>
                    Record appeal review
                  </button>
                </form>
              )}
            </section>
          ))}
      </DataBoundary>
      {section === "encounters" && (
        <div className="notice">
          Create encounter documentation as part of the{" "}
          <Link href="/app/claims/new" style={{ textDecoration: "underline" }}>
            guided claim preparation workflow
          </Link>
          .
        </div>
      )}
      {section === "coverage" && (
        <section className="panel">
          <h2>Publish a new local pilot tariff version</h2>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await action.run("/coverage/tariffs", {
                  label: d.label,
                  effectiveFrom: d.from,
                  effectiveTo: d.to,
                  items: JSON.parse(String(d.items)),
                });
              } catch {
                action.setMessage("Items must be valid JSON.");
              }
            }}
          >
            <label>
              Version label
              <input name="label" minLength={5} required />
            </label>
            <div className="form-grid">
              <label>
                Effective from
                <input name="from" type="date" required />
              </label>
              <label>
                Effective to
                <input name="to" type="date" required />
              </label>
            </div>
            <label>
              Catalogue items
              <textarea
                name="items"
                className="code-input"
                defaultValue={
                  '[{"code":"PILOT-CONSULT","description":"Outpatient consultation","currency":"USD","maxUnitMinor":"2500"}]'
                }
              />
            </label>
            <button className="button secondary" disabled={action.busy}>
              Create immutable future tariff version
            </button>
          </form>
        </section>
      )}
    </>
  );
}
