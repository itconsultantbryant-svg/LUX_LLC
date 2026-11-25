"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Gavel,
  HeartPulse,
  Inbox,
  Layers3,
  LifeBuoy,
  Link as LinkIcon,
  Network,
  ReceiptText,
  Scale,
  Search,
  SearchCheck,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  XCircle,
  type LucideIcon,
} from "lucide-react";
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
export function DestinationModule() {
  const { demo, me } = useWorkspace();
  const q = useData("/destination-changes");
  const action = useAction();
  return (
    <>
      <ModuleTitle
        title="Wallet destination"
        text="Verified destinations receive facility payments. Changes require a separate approver and a fresh session; LUX never holds funds."
      />
      <Feedback action={action} />
      <section className="panel">
        <h2>Propose a new verified destination</h2>
        <p>
          The proposal is recorded first. Approval creates a new immutable
          destination version only after verification evidence is supplied.
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
            <input name="reference" minLength={6} maxLength={100} required />
          </label>
          <label>
            Reason for the change
            <textarea name="reason" minLength={10} maxLength={1000} required />
          </label>
          <button className="button" disabled={action.busy}>
            Record destination proposal
          </button>
        </form>
      </section>
      <DataBoundary {...q} retry={q.reload}>
        {q.data?.length
          ? q.data.map((c: any) => (
              <section className="panel" key={c.id}>
                <div className="panel-heading-row">
                  <div>
                    <span className="eyebrow">Destination change</span>
                    <h2>{c.proposed_reference}</h2>
                  </div>
                  <Status value={c.status} />
                </div>
                <p>{c.reason}</p>
                <small className="subtle">
                  Proposed {date(c.created_at)}
                  {c.checker_id ? " · checker recorded" : " · awaiting checker"}
                </small>
                {c.status === "PENDING" && (
                  <form
                    className="stack-form"
                    style={{ marginTop: 18 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const d = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      await action.run(`/destination-changes/${c.id}/approve`, {
                        verificationEvidence: d.verificationEvidence,
                        demoSelfCheck:
                          demo && c.maker_id === me.user.id ? true : undefined,
                      });
                    }}
                  >
                    {c.maker_id === me.user.id && (
                      <div className="notice">
                        You proposed this change. Production requires a separate
                        facility administrator. In this demo the checker step is
                        attributed to the seeded internal checker identity.
                      </div>
                    )}
                    <label>
                      Verification evidence
                      <textarea
                        name="verificationEvidence"
                        minLength={20}
                        maxLength={1000}
                        required
                      />
                      <small>
                        Record what was independently verified. Never paste a
                        PIN or secret.
                      </small>
                    </label>
                    <button className="button secondary" disabled={action.busy}>
                      {c.maker_id === me.user.id
                        ? "Demo approve destination"
                        : "Approve destination change"}
                    </button>
                  </form>
                )}
              </section>
            ))
          : !q.loading && <Empty title="No destination changes recorded." />}
      </DataBoundary>
    </>
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
                {p.is_maker && p.state === "AWAITING_AUTHORIZATION" && (
                  <div className="notice">
                    You recorded this maker request. Production requires a
                    separate human checker. In this demo environment the checker
                    step is attributed to the seeded internal checker identity,
                    and the audit trail records the substitution.
                  </div>
                )}
                <div className="button-row">
                  {org.permissions.includes("payments.authorize") &&
                    p.state === "AWAITING_AUTHORIZATION" && (
                      <button
                        className="button"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(
                            `/payments/${p.id}/approve`,
                            {
                              demoSelfCheck:
                                p.mode === "demo" && Boolean(p.is_maker),
                            },
                            p.version,
                          )
                        }
                      >
                        {p.is_maker
                          ? "Demo check & authorize"
                          : "Check & authorize"}
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
export function PayrollModule() {
  const q = useData("/payroll");
  const action = useAction();
  const d = q.data;
  const totals: any[] = Array.isArray(d?.totals) ? d.totals : [];
  const subscriptions: any[] = Array.isArray(d?.subscriptions)
    ? d.subscriptions
    : [];
  const deductions: any[] = Array.isArray(d?.deductions) ? d.deductions : [];
  const bands: any[] = Array.isArray(d?.bands) ? d.bands : [];
  const eligible: any[] = Array.isArray(d?.eligiblePatients)
    ? d.eligiblePatients
    : [];
  const members = totals.reduce(
    (sum, row) => sum + Number(row.members || 0),
    0,
  );
  const monthly = totals.reduce(
    (sum, row) => sum + BigInt(row.monthlyDeductionMinor || 0),
    0n,
  );
  const deducted = totals.reduce(
    (sum, row) => sum + BigInt(row.deductedThisPeriodMinor || 0),
    0n,
  );
  return (
    <>
      <SectionHero
        eyebrow="Finance & settlement"
        title="Payroll & salary cover."
        text="Insurer packages are linked to employment bands. The current month's simulated deduction is recorded automatically for every active member, and the cover travels with the patient into claim validation."
        image="team-at-work"
        badge={{
          label: "Active members",
          value: members,
          note: "Simulated payroll records",
        }}
        actions={[
          { href: "/app/wallet", label: "Wallet & float", icon: Wallet },
          { href: "/app/claims", label: "Review claims", icon: FileText },
        ]}
      />
      <Feedback action={action} />
      <DataBoundary loading={q.loading} error={q.error} retry={q.reload}>
        {!d ? (
          <p role="status">Loading payroll records…</p>
        ) : (
          <>
            <div className="notice">
              {d.simulationNotice} Automatic period: {d.period.label}.
            </div>
            <SectionMetrics
              items={[
                {
                  icon: Users,
                  label: "Active members",
                  value: members,
                  note: "With salary-funded cover",
                  tone: "navy",
                },
                {
                  icon: BadgeDollarSign,
                  label: "Monthly deductions",
                  value: money(monthly),
                  note: d.period.label,
                  tone: "green",
                },
                {
                  icon: ReceiptText,
                  label: "Deducted this period",
                  value: money(deducted),
                  note: "Simulated only",
                  tone: "orange",
                },
                {
                  icon: Layers3,
                  label: "Packages & bands",
                  value: `${d.packages.length} / ${bands.length}`,
                  note: "Insurer-defined cover",
                },
              ]}
            />
            <SectionPanel
              eyebrow="Catalogue"
              title="Packages and employment bands"
              count={`${bands.length} bands`}
            >
              <SectionTable
                caption="Payroll packages and employment bands"
                rows={bands}
                columns={[
                  {
                    label: "Package",
                    render: (row) => (
                      <>
                        <b>{row.package_name}</b>
                        <br />
                        <small>
                          {row.package_code} ·{" "}
                          {money(row.monthly_premium_minor)} reference premium
                        </small>
                      </>
                    ),
                  },
                  { label: "Employment band", render: (row) => row.label },
                  {
                    label: "Salary range",
                    render: (row) =>
                      `${money(row.min_salary_minor)} – ${
                        row.max_salary_minor
                          ? money(row.max_salary_minor)
                          : "and above"
                      }`,
                  },
                  {
                    label: "Deduction",
                    render: (row) => money(row.deduction_minor),
                    align: "right",
                  },
                  {
                    label: "Members",
                    render: (row) => row.members,
                    align: "right",
                  },
                ]}
                empty={
                  <Empty
                    title="No packages configured."
                    text="Packages and employment bands appear here once the insurer catalogue is available."
                  />
                }
              />
            </SectionPanel>
            {d.canManage && (
              <SectionPanel
                eyebrow="Enrolment"
                title="Add a salary-funded member"
                count={`${eligible.length} eligible`}
              >
                <p>
                  Choose an eligible member and an employment band. The band
                  fixes the monthly deduction recorded in the demo payroll
                  ledger. No real employer payroll is contacted.
                </p>
                <form
                  className="stack-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = Object.fromEntries(new FormData(form));
                    const result = await action.run("/payroll/subscriptions", {
                      patientId: data.patientId,
                      level: data.level,
                      employerName: data.employerName,
                      grossSalaryMinor: String(data.grossSalaryMinor),
                    });
                    if (result) form.reset();
                  }}
                >
                  <label>
                    Member
                    <select name="patientId" required defaultValue="">
                      <option value="" disabled>
                        Select an eligible member
                      </option>
                      {eligible.map((patient) => (
                        <option value={patient.id} key={patient.id}>
                          {patient.display_name} · {patient.facility_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Employment band
                    <select name="level" required defaultValue="">
                      <option value="" disabled>
                        Select a band
                      </option>
                      {bands.map((band) => (
                        <option value={band.level} key={band.level}>
                          {band.package_name} · {band.label} ·{" "}
                          {money(band.deduction_minor)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Employer
                    <input
                      name="employerName"
                      minLength={2}
                      maxLength={120}
                      required
                      placeholder="Synthetic employer name"
                    />
                  </label>
                  <label>
                    Gross monthly salary (minor units)
                    <input
                      name="grossSalaryMinor"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      defaultValue="60000"
                      required
                    />
                  </label>
                  <button className="button" disabled={action.busy}>
                    Enrol member
                  </button>
                </form>
              </SectionPanel>
            )}
            {d.scope === "INSURER" && (
              <SectionPanel
                eyebrow="Automation"
                title="Monthly deduction run"
                count={d.period.label}
              >
                <p>
                  The demo run is idempotent: a member receives one simulated
                  deduction per calendar month, even if the dashboard is opened
                  repeatedly.
                </p>
                <button
                  className="button secondary"
                  disabled={action.busy}
                  onClick={() => action.run("/payroll/run", {})}
                >
                  Record this month's simulated deductions
                </button>
              </SectionPanel>
            )}
            <SectionPanel
              eyebrow="Members"
              title="Salary-funded subscriptions"
              count={`${subscriptions.length} records`}
            >
              <SectionTable
                caption="Salary-funded payroll subscriptions"
                rows={subscriptions}
                columns={[
                  { label: "Member", render: (row) => row.patient_name },
                  { label: "Employer", render: (row) => row.employer_name },
                  {
                    label: "Cover",
                    render: (row) => (
                      <>
                        {row.package_name}
                        <br />
                        <small>{row.band_label}</small>
                      </>
                    ),
                  },
                  {
                    label: "Salary",
                    render: (row) =>
                      money(row.gross_salary_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Deduction",
                    render: (row) =>
                      money(
                        row.latest_deduction_minor || row.deduction_minor,
                        row.currency,
                      ),
                    align: "right",
                  },
                  { label: "Period", render: (row) => day(row.latest_period) },
                  {
                    label: "Status",
                    render: (row) => (
                      <>
                        <Status value={row.latest_status || row.status} />
                        {row.simulated && (
                          <small className="sec-tag"> simulated</small>
                        )}
                      </>
                    ),
                  },
                ]}
                empty={
                  <Empty
                    title="No salary-funded members yet."
                    text="Enrol a member above to link cover to an employment band."
                  />
                }
              />
            </SectionPanel>
            <SectionPanel
              eyebrow="Ledger"
              title="Recent payroll deductions"
              count={`${deductions.length} records`}
            >
              <SectionTable
                caption="Recent simulated payroll deductions"
                rows={deductions}
                columns={[
                  { label: "Period", render: (row) => day(row.period_start) },
                  { label: "Member", render: (row) => row.patient_name },
                  { label: "Employer", render: (row) => row.employer_name },
                  {
                    label: "Gross",
                    render: (row) =>
                      money(row.gross_salary_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Deduction",
                    render: (row) => money(row.deduction_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Net",
                    render: (row) => money(row.net_salary_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Status",
                    render: (row) => <Status value={row.status} />,
                  },
                ]}
                empty={
                  <Empty
                    title="No deductions recorded."
                    text="Deductions appear after the current period run."
                  />
                }
              />
            </SectionPanel>
          </>
        )}
      </DataBoundary>
    </>
  );
}

export function WalletModule() {
  const q = useData("/finance/wallet", 3000);
  const action = useAction();
  const d = q.data;
  const wallets: any[] = Array.isArray(d?.wallets) ? d.wallets : [];
  const transfers: any[] = Array.isArray(d?.transactions) ? d.transactions : [];
  const totals: any[] = Array.isArray(d?.totals) ? d.totals : [];
  const feeShare: any[] = Array.isArray(d?.feeShare) ? d.feeShare : [];
  const payable: any[] = Array.isArray(d?.payableClaims) ? d.payableClaims : [];
  const platform = d?.scope === "PLATFORM";
  const partner = d?.scope === "PARTNER";
  const ownBalance = wallets
    .filter((wallet) => !platform || wallet.organization_type === "INSURER")
    .reduce((sum, wallet) => sum + BigInt(wallet.balance_minor || 0), 0n);
  const facilityCredited = totals.reduce(
    (sum, row) => sum + BigInt(row.facilityCreditedMinor || 0),
    0n,
  );
  const fees = totals.reduce(
    (sum, row) => sum + BigInt(row.feesMinor || 0),
    0n,
  );
  const lux = totals.reduce((sum, row) => sum + BigInt(row.luxMinor || 0), 0n);
  const orange = totals.reduce(
    (sum, row) => sum + BigInt(row.orangeMinor || 0),
    0n,
  );
  const transfersCount = totals.reduce(
    (sum, row) => sum + Number(row.count || 0),
    0,
  );
  const shareCount = feeShare.reduce(
    (sum, row) => sum + Number(row.count || 0),
    0,
  );
  const shareOrange = feeShare.reduce(
    (sum, row) => sum + BigInt(row.orangeMinor || 0),
    0n,
  );
  const metrics = partner
    ? [
        {
          icon: Wallet,
          label: "Available balance",
          value: money(ownBalance),
          note: "Simulated wallet",
          tone: "green",
        },
        {
          icon: ReceiptText,
          label: "Settled transfers",
          value: shareCount,
          note: "Aggregate only",
          tone: "navy",
        },
        {
          icon: Building2,
          label: "Orange fee share",
          value: money(shareOrange),
          note: "Simulated accrual",
          tone: "orange",
        },
      ]
    : [
        {
          icon: Wallet,
          label: platform ? "Insurer demo float" : "Available balance",
          value: money(ownBalance),
          note: "Simulated wallet",
          tone: "green",
        },
        {
          icon: ReceiptText,
          label: "Settled transfers",
          value: transfersCount,
          note: "Settlement less reversals",
          tone: "navy",
        },
        {
          icon: Building2,
          label: "Credited to facilities",
          value: money(facilityCredited),
          note: "Facility net of fees",
          tone: "orange",
        },
        {
          icon: BadgeDollarSign,
          label: "LUX / Orange share",
          value: `${money(lux)} / ${money(orange)}`,
          note: `${money(fees)} total service fees`,
        },
      ];
  return (
    <>
      <SectionHero
        eyebrow="Finance & settlement"
        title="Wallet & float."
        text="A transparent simulation of insurer-funded Orange Money settlement. Facility balances and the LUX/Orange fee shares update as soon as a demo payment settles, and the view refreshes every three seconds."
        image="team-at-work"
        badge={{
          label: platform ? "Insurer demo float" : "Available demo balance",
          value: money(ownBalance),
          note: "Simulated · refreshes every 3s",
        }}
        actions={[
          { href: "/app/payroll", label: "Payroll cover", icon: Users },
          { href: "/app/payments", label: "Payments", icon: ReceiptText },
        ]}
      />
      <Feedback action={action} />
      <DataBoundary loading={q.loading} error={q.error} retry={q.reload}>
        {!d ? (
          <p role="status">Loading wallet records…</p>
        ) : (
          <>
            <div className="notice">
              {d.simulationNotice} This view refreshes every three seconds.
            </div>
            <SectionMetrics items={metrics} />
            <SectionPanel
              eyebrow="Balances"
              title="Simulated Orange Money wallets"
              count={`${wallets.length} wallets`}
            >
              <SectionTable
                caption="Simulated Orange Money wallet balances"
                rows={wallets}
                columns={[
                  {
                    label: "Organization",
                    render: (row) => row.organization_name,
                  },
                  {
                    label: "Type",
                    render: (row) => humanize(row.organization_type),
                  },
                  { label: "Currency", render: (row) => row.currency },
                  {
                    label: "Balance",
                    render: (row) => money(row.balance_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Updated",
                    render: (row) => date(row.updated_at),
                  },
                  {
                    label: "Mode",
                    render: (row) => (row.simulated ? "Simulated" : "Live"),
                  },
                ]}
                empty={
                  <Empty
                    title="No wallet provisioned."
                    text="A simulated wallet is created when the organization is configured."
                  />
                }
              />
            </SectionPanel>
            <SectionPanel
              eyebrow="Fee split"
              title={
                partner
                  ? "Your Orange fee share"
                  : "LUX and Orange shared percentages"
              }
              count={
                partner
                  ? `${shareCount} transfers`
                  : `${transfersCount} transfers`
              }
            >
              {partner ? (
                <dl className="key-values">
                  {feeShare.map((row) => (
                    <div key={row.currency}>
                      <dt>{row.currency} Orange service-fee share</dt>
                      <dd>
                        {money(row.orangeMinor, row.currency)} across{" "}
                        {row.count} simulated settlements
                      </dd>
                    </div>
                  ))}
                  {!feeShare.length && (
                    <div>
                      <dt>No settled transfers</dt>
                      <dd>
                        Your 1% Orange share appears here after the first
                        simulated instant payment.
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <dl className="key-values">
                  {totals.map((row) => (
                    <div key={row.currency}>
                      <dt>{row.currency} service fees</dt>
                      <dd>
                        {money(row.feesMinor, row.currency)} total ·{" "}
                        {money(row.luxMinor, row.currency)} LUX ·{" "}
                        {money(row.orangeMinor, row.currency)} Orange
                      </dd>
                    </div>
                  ))}
                  {!totals.length && (
                    <div>
                      <dt>No settled transfers</dt>
                      <dd>
                        The 1% LUX and 1% Orange shares appear here after the
                        first instant payment.
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </SectionPanel>
            {payable.length > 0 && (
              <SectionPanel
                eyebrow="Ready to pay"
                title="Approved claims with a payable remainder"
                count={`${payable.length} claims`}
              >
                <SectionTable
                  caption="Approved claims ready for instant payment"
                  rows={payable}
                  columns={[
                    {
                      label: "Claim",
                      render: (row) => (
                        <Link href={"/app/claims/" + row.id}>
                          {row.reference}
                        </Link>
                      ),
                    },
                    { label: "Member", render: (row) => row.patient_name },
                    { label: "Facility", render: (row) => row.facility_name },
                    {
                      label: "Payable",
                      render: (row) => money(row.payable_minor, row.currency),
                      align: "right",
                    },
                    {
                      label: "Action",
                      render: (row) => (
                        <Link
                          className="inline-button"
                          href={"/app/claims/" + row.id}
                        >
                          Open instant payment
                        </Link>
                      ),
                    },
                  ]}
                  empty={<Empty />}
                />
              </SectionPanel>
            )}
            {d.canFund && (
              <SectionPanel eyebrow="Platform" title="Add demo float">
                <p>
                  Demo float is an append-only simulated funding record. It is
                  not a customer deposit and LUX holds no customer money.
                </p>
                <form
                  className="stack-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = Object.fromEntries(new FormData(form));
                    const result = await action.run(
                      "/finance/wallet/fundings",
                      {
                        organizationId: data.organizationId,
                        currency: "USD",
                        amountMinor: String(data.amountMinor),
                        reason: String(data.reason),
                      },
                    );
                    if (result) form.reset();
                  }}
                >
                  <label>
                    Organization
                    <select name="organizationId" required defaultValue="">
                      <option value="" disabled>
                        Select an insurer
                      </option>
                      {wallets
                        .filter(
                          (wallet) =>
                            wallet.organization_type === "INSURER" &&
                            wallet.currency === "USD",
                        )
                        .map((wallet) => (
                          <option
                            value={wallet.organization_id}
                            key={wallet.organization_id}
                          >
                            {wallet.organization_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Amount (minor units)
                    <input
                      name="amountMinor"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      defaultValue="1000000"
                      required
                    />
                  </label>
                  <label>
                    Reason
                    <input
                      name="reason"
                      minLength={5}
                      maxLength={240}
                      defaultValue="Demo float top-up for settlement testing"
                      required
                    />
                  </label>
                  <button className="button" disabled={action.busy}>
                    Record simulated float
                  </button>
                </form>
              </SectionPanel>
            )}
            <SectionPanel
              eyebrow="Ledger"
              title="Recent wallet transfers"
              count={`${transfers.length} records`}
            >
              <SectionTable
                caption="Recent simulated wallet transfers"
                rows={transfers}
                columns={[
                  {
                    label: "Time",
                    render: (row) => date(row.created_at),
                  },
                  {
                    label: "From",
                    render: (row) => row.from_organization_name,
                  },
                  { label: "To", render: (row) => row.to_organization_name },
                  {
                    label: "Kind",
                    render: (row) => <Status value={row.kind} />,
                  },
                  {
                    label: "Principal",
                    render: (row) => money(row.principal_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "Fee",
                    render: (row) => money(row.fee_total_minor, row.currency),
                    align: "right",
                  },
                  {
                    label: "LUX / Orange",
                    render: (row) =>
                      `${money(row.lux_minor, row.currency)} / ${money(row.orange_minor, row.currency)}`,
                    align: "right",
                  },
                ]}
                empty={
                  <Empty
                    title="No transfers yet."
                    text={
                      partner
                        ? "Your Orange fee credits are included in your wallet balance. Individual counterparties and their balances are not shown."
                        : "Open an approved claim and complete the four-digit demo confirmation to see an instant settlement."
                    }
                  />
                }
              />
            </SectionPanel>
          </>
        )}
      </DataBoundary>
    </>
  );
}

export function PatientAccessModule() {
  const q = useData("/patient-access");
  const action = useAction();
  const [invitation, setInvitation] = useState<any>(null);
  const rows = q.data || [];
  const available = rows.filter((row: any) => !row.account_id);
  return (
    <>
      <ModuleTitle
        title="Patient portal access"
        text="Invite an insured patient from your coverage records and publish the monthly and annual limits that appear in their own portal."
      />
      <Feedback action={action} />
      {q.error && (
        <div className="error-notice" role="alert">
          {q.error}
          <br />
          <button className="inline-button" onClick={q.reload}>
            Retry loading
          </button>
        </div>
      )}
      <section className="panel">
        <h2>Invite an insured patient</h2>
        <p>
          The invitation is tied to this insurer&apos;s patient reference. The
          patient chooses their own password and can only see their own policy,
          cover and claims. It does not create an organization membership.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email") || "").trim();
            const result = await action.run("/patient-access/invitations", {
              referenceId: String(f.get("referenceId")),
              ...(email ? { email } : {}),
            });
            if (result) setInvitation(result);
          }}
        >
          <label>
            Insured patient
            <select name="referenceId" required defaultValue="">
              <option value="" disabled>
                Select a patient record
              </option>
              {available.map((row: any) => (
                <option key={row.reference_id} value={row.reference_id}>
                  {row.display_name} · {row.policy_reference}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email address (optional if already on the insurer record)
            <input name="email" type="email" autoComplete="email" />
          </label>
          <button
            className="button"
            disabled={action.busy || !available.length}
          >
            Create portal invitation
          </button>
          {!available.length && rows.length > 0 && (
            <p className="dash-panel-note">
              Every insured patient already has a portal invitation or active
              account.
            </p>
          )}
        </form>
        {invitation && (
          <div className="patient-invite-result" role="status">
            <strong>
              Invitation ready for {invitation.patientName} ({invitation.email})
            </strong>
            <p>{invitation.message}</p>
            {invitation.link ? (
              <>
                <label>
                  Demo-only invitation link
                  <input readOnly value={invitation.link} />
                </label>
                <small>
                  Share this single-use link with the patient. The invitation
                  expires in 72 hours. In live mode it is sent by email and the
                  link is not returned to the browser.
                </small>
              </>
            ) : (
              <small>Delivery: {invitation.delivery}</small>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Publish monthly and annual limits</h2>
        <p>
          Limits are versioned and insurer-controlled. Usage is not stored in
          this table; it is calculated from approved claims and their service
          dates, so the patient sees the same records as the insurer.
        </p>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await action.run("/patient-access/coverage-limits", {
              referenceId: String(f.get("referenceId")),
              currency: String(f.get("currency")),
              monthlyLimitMinor: String(
                Math.round(Number(f.get("monthly")) * 100),
              ),
              annualLimitMinor: String(
                Math.round(Number(f.get("annual")) * 100),
              ),
              effectiveFrom: String(f.get("effectiveFrom")),
              effectiveTo: String(f.get("effectiveTo")),
            });
          }}
        >
          <label>
            Insured patient
            <select name="referenceId" required defaultValue="">
              <option value="" disabled>
                Select a patient record
              </option>
              {rows.map((row: any) => (
                <option key={row.reference_id} value={row.reference_id}>
                  {row.display_name} · {row.policy_reference}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              Currency
              <select name="currency" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="LRD">LRD</option>
              </select>
            </label>
            <label>
              Monthly limit (major units)
              <input
                name="monthly"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              Annual limit (major units)
              <input name="annual" type="number" min="0" step="0.01" required />
            </label>
            <label>
              Effective from
              <input name="effectiveFrom" type="date" required />
            </label>
            <label>
              Effective to
              <input name="effectiveTo" type="date" required />
            </label>
          </div>
          <button className="button secondary" disabled={action.busy}>
            Publish coverage limits
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Insured patient records</h2>
        {q.loading && !rows.length ? (
          <p role="status">Loading records…</p>
        ) : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Member reference</th>
                  <th>Policy</th>
                  <th>Coverage</th>
                  <th>Portal account</th>
                  <th>Monthly limit</th>
                  <th>Annual limit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.reference_id}>
                    <td>{row.display_name}</td>
                    <td>{row.external_reference}</td>
                    <td>{row.policy_reference}</td>
                    <td>
                      <Status value={row.status} />
                    </td>
                    <td>
                      {row.account_email
                        ? row.account_email
                        : row.invitation_expires_at
                          ? `Invitation pending until ${date(row.invitation_expires_at)}`
                          : "Not invited"}
                    </td>
                    <td>
                      {row.monthly_limit_minor
                        ? money(row.monthly_limit_minor, row.currency)
                        : "Not published"}
                    </td>
                    <td>
                      {row.annual_limit_minor
                        ? money(row.annual_limit_minor, row.currency)
                        : "Not published"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No insured patient records."
            text="Import coverage for your insured members before inviting them to the patient portal."
          />
        )}
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
  switch (section) {
    case "returned":
      return <ReturnedModule />;
    case "flagged":
      return <FlaggedModule />;
    case "decisions":
      return <DecisionsModule />;
    case "coverage":
      return <CoverageModule />;
    case "contracts":
      return <ContractsModule />;
    case "organizations":
      return <OrganizationsModule />;
    case "organization-requests":
      return <OrganizationRequestsModule />;
    case "enquiries":
      return <EnquiriesModule />;
    case "integrations":
      return <IntegrationsModule />;
    case "jobs":
      return <JobsModule />;
    case "audit":
      return <AuditModule />;
    default:
      return (
        <>
          <ModuleTitle title={section.replaceAll("-", " ")} />
          <Empty
            title="This section is not available."
            text="Choose a destination from the sidebar."
          />
        </>
      );
  }
}

function humanize(value: unknown) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
function day(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-LR", {
    dateStyle: "medium",
    timeZone: "Africa/Monrovia",
  }).format(new Date(value));
}
function sumMinor(rows: any[], key = "submitted_minor") {
  return rows.reduce((total, row) => total + BigInt(row[key] || 0), 0n);
}
function uniqueValues(rows: any[], key: string) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))] as string[];
}
function daysSince(value: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}
function matches(row: any, query: string, keys: string[]) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return keys.some((key) =>
    String(row[key] ?? "")
      .toLowerCase()
      .includes(needle),
  );
}
type Column = {
  label: string;
  render: (row: any) => ReactNode;
  align?: "right";
};

function SectionHero({
  eyebrow,
  title,
  text,
  image = "team-at-work",
  badge,
  actions = [],
}: {
  eyebrow: string;
  title: string;
  text: string;
  image?: string;
  badge: { label: string; value: string | number; note?: string };
  actions?: { href: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <section className="dash-hero sec-hero">
      <div className="dash-hero-art" aria-hidden="true">
        <picture>
          <source
            type="image/avif"
            srcSet={`/media/illustrations/${image}-480.avif 480w, /media/illustrations/${image}-960.avif 960w`}
            sizes="(max-width: 900px) 100vw, 46vw"
          />
          <source
            type="image/webp"
            srcSet={`/media/illustrations/${image}-480.webp 480w, /media/illustrations/${image}-960.webp 960w`}
            sizes="(max-width: 900px) 100vw, 46vw"
          />
          <img
            src={`/media/illustrations/${image}-960.jpg`}
            alt=""
            width={960}
            height={640}
          />
        </picture>
      </div>
      <div className="dash-hero-copy">
        <span className="dash-hero-eyebrow">
          <Sparkles size={13} /> {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{text}</p>
        {actions.length > 0 && (
          <div className="dash-hero-actions">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  className="dash-action"
                  href={action.href}
                  key={action.href}
                >
                  <Icon size={16} /> {action.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <div className="dash-hero-badge">
        <small>{badge.label}</small>
        <strong>{badge.value}</strong>
        <span>
          <Activity size={13} /> {badge.note || "Live from authorized records"}
        </span>
      </div>
    </section>
  );
}

function SectionMetrics({
  items,
}: {
  items: {
    icon: LucideIcon;
    label: string;
    value: string | number;
    note: string;
    tone?: string;
  }[];
}) {
  return (
    <div className="dash-metrics">
      {items.map(({ icon: Icon, label, value, note, tone = "" }) => (
        <article className={"dash-metric " + tone} key={label}>
          <span className="dash-metric-icon">
            <Icon size={18} />
          </span>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{note}</small>
        </article>
      ))}
    </div>
  );
}

function SectionPanel({
  eyebrow,
  title,
  count,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  count?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = "sec-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      className={"dash-panel sec-panel " + className}
      aria-labelledby={id}
    >
      <header>
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={id}>{title}</h2>
        </div>
        {count && <span className="sec-count">{count}</span>}
      </header>
      {children}
    </section>
  );
}

function SectionToolbar({
  query,
  setQuery,
  placeholder,
  chips = [],
  chip,
  setChip,
  count,
}: {
  query?: string;
  setQuery?: (value: string) => void;
  placeholder?: string;
  chips?: { value: string; label: string }[];
  chip?: string;
  setChip?: (value: string) => void;
  count?: string;
}) {
  return (
    <div className="sec-toolbar">
      {setQuery && (
        <label className="sec-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search records</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder || "Search records"}
            type="search"
          />
        </label>
      )}
      {setChip && chips.length > 0 && (
        <div className="sec-chips" role="group" aria-label="Filter records">
          {chips.map((option) => (
            <button
              type="button"
              key={option.value}
              className={"sec-chip" + (chip === option.value ? " active" : "")}
              aria-pressed={chip === option.value}
              onClick={() => setChip(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {count && <span className="sec-count">{count}</span>}
    </div>
  );
}

function SectionTable({
  caption,
  columns,
  rows,
  empty,
}: {
  caption: string;
  columns: Column[];
  rows: any[];
  empty: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div
      className="table-wrap sec-table"
      role="region"
      aria-label={caption}
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.reference || index}>
              {columns.map((column) => (
                <td
                  key={column.label}
                  className={column.align === "right" ? "sec-right" : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClaimLink({ row }: { row: any }) {
  return (
    <Link href={"/app/claims/" + (row.claim_id || row.id)}>
      {row.reference}
    </Link>
  );
}

function ReturnedModule() {
  const q = useData("/claims?state=NEEDS_INFORMATION");
  const rows: any[] = Array.isArray(q.data?.data) ? q.data.data : [];
  const [query, setQuery] = useState("");
  const [facility, setFacility] = useState("all");
  const facilities = uniqueValues(rows, "facility");
  const filtered = rows.filter(
    (row) =>
      (facility === "all" || row.facility === facility) &&
      matches(row, query, ["reference", "facility", "insurer"]),
  );
  const oldest = rows.reduce(
    (max, row) => Math.max(max, daysSince(row.updated_at)),
    0,
  );
  return (
    <>
      <SectionHero
        eyebrow="Care delivery · Facility"
        title="Returned claims."
        text="Claims the insurer has sent back for more information. Correct the evidence and resubmit as a new version; the original submission stays in history."
        image="hero-doctor-patient"
        badge={{
          label: "Awaiting information",
          value: rows.length,
          note: "Your facility only",
        }}
        actions={[
          { href: "/app/claims", label: "All claims", icon: FileText },
          {
            href: "/app/claims/new",
            label: "Prepare a claim",
            icon: ClipboardCheck,
          },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Inbox,
            label: "Returned claims",
            value: rows.length,
            note: "Needs a correction",
            tone: "orange",
          },
          {
            icon: ReceiptText,
            label: "Submitted value",
            value: money(sumMinor(rows)),
            note: "Awaiting information",
            tone: "navy",
          },
          {
            icon: Building2,
            label: "Facilities involved",
            value: facilities.length,
            note: "Scoped to your access",
          },
          {
            icon: Clock3,
            label: "Oldest in queue",
            value: oldest + "d",
            note: oldest ? "Since last update" : "Nothing waiting",
            tone: oldest > 7 ? "red" : "green",
          },
        ]}
      />
      <SectionPanel
        eyebrow="Working queue"
        title="Claims needing information"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search reference, facility or insurer"
          chips={[
            { value: "all", label: "All facilities" },
            ...facilities.map((name) => ({ value: name, label: name })),
          ]}
          chip={facility}
          setChip={setFacility}
        />
        <SectionTable
          caption="Returned claims"
          rows={filtered}
          columns={[
            { label: "Claim", render: (row) => <ClaimLink row={row} /> },
            { label: "Facility", render: (row) => row.facility },
            { label: "Insurer", render: (row) => row.insurer },
            {
              label: "Submitted",
              render: (row) => money(row.submitted_minor, row.currency),
              align: "right",
            },
            {
              label: "Updated",
              render: (row) => day(row.updated_at),
            },
            {
              label: "Action",
              render: (row) => (
                <Link className="inline-button" href={"/app/claims/" + row.id}>
                  Open claim
                </Link>
              ),
            },
          ]}
          empty={
            <Empty
              title={
                rows.length
                  ? "No claims match this filter."
                  : "Nothing returned."
              }
              text={
                rows.length
                  ? "Clear the search or choose another facility."
                  : "When an insurer needs more information, the claim appears here with the reason and the evidence requested."
              }
            />
          }
        />
      </SectionPanel>
      <section className="dash-panel sec-panel">
        <header>
          <div>
            <span className="eyebrow">Next steps</span>
            <h2>How a returned claim moves forward</h2>
          </div>
        </header>
        <ol className="sec-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Read the insurer’s reason</strong>
              <p>
                Open the claim to see the decision reason, validated items and
                any finding that triggered the return.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Correct evidence, not the history</strong>
              <p>
                Add or correct items and attachments. Earlier submissions remain
                visible and audit-linked.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Resubmit deliberately</strong>
              <p>
                Resubmission creates a new version for insurer review. It is not
                an approval and does not move money.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}

function FlaggedModule() {
  const q = useData("/flagged");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = uniqueValues(rows, "category");
  const filtered = rows.filter(
    (row) =>
      (category === "all" || row.category === category) &&
      matches(row, query, ["reference", "category", "reason", "field"]),
  );
  const claims = new Set(rows.map((row) => row.reference)).size;
  return (
    <>
      <SectionHero
        eyebrow="Claims operations · Review"
        title="Flagged claims."
        text="Possible inconsistencies raised by validation. A flag is a prompt for human review — never a confirmed error, a fraud verdict or an automatic decision."
        badge={{
          label: "Open findings",
          value: rows.length,
          note: "For insurer review",
        }}
        actions={[
          { href: "/app/claims", label: "Review queue", icon: ClipboardCheck },
          { href: "/app/decisions", label: "Decisions", icon: Gavel },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: ShieldAlert,
            label: "Open findings",
            value: rows.length,
            note: "Human review required",
            tone: "orange",
          },
          {
            icon: FileText,
            label: "Claims affected",
            value: claims,
            note: "One claim may hold several",
            tone: "navy",
          },
          {
            icon: Layers3,
            label: "Finding categories",
            value: categories.length,
            note: categories.join(", ") || "None recorded",
          },
          {
            icon: SearchCheck,
            label: "Awaiting review",
            value: rows.filter((row) => row.state === "AWAITING_REVIEW").length,
            note: "In the insurer queue",
            tone: "green",
          },
        ]}
      />
      <div className="notice">
        A flag records a question about the evidence. It does not decide
        coverage, does not accuse anyone, and cannot be treated as proof of
        wrongdoing. Resolve it with the claim’s full context.
      </div>
      <SectionPanel
        eyebrow="Exception queue"
        title="Findings to review"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search claim, category or reason"
          chips={[
            { value: "all", label: "All categories" },
            ...categories.map((name) => ({
              value: name,
              label: humanize(name),
            })),
          ]}
          chip={category}
          setChip={setCategory}
        />
        <SectionTable
          caption="Flagged claim findings"
          rows={filtered}
          columns={[
            { label: "Claim", render: (row) => <ClaimLink row={row} /> },
            {
              label: "State",
              render: (row) => <Status value={row.state} />,
            },
            {
              label: "Category",
              render: (row) => (
                <span className="sec-tag">{humanize(row.category)}</span>
              ),
            },
            { label: "Field", render: (row) => humanize(row.field) },
            {
              label: "Finding",
              render: (row) => (
                <span className="sec-clamp" title={row.reason}>
                  {row.reason}
                </span>
              ),
            },
            {
              label: "Evidence",
              render: (row) => row.evidence || "Not supplied",
            },
          ]}
          empty={
            <Empty
              title={
                rows.length
                  ? "No findings match this filter."
                  : "No open flags."
              }
              text={
                rows.length
                  ? "Clear the search or choose another category."
                  : "Validation will list possible inconsistencies here for human review. Absence of a flag is not a coverage decision."
              }
            />
          }
        />
      </SectionPanel>
      <section className="dash-panel sec-panel">
        <header>
          <div>
            <span className="eyebrow">Operating rule</span>
            <h2>Evidence first, decision second</h2>
          </div>
        </header>
        <ul className="sec-checks">
          <li>Review the full claim, items and attachments before acting.</li>
          <li>
            Record the insurer’s decision separately; a finding resolution is
            not an approval.
          </li>
          <li>
            Never treat a tariff question as a fraud conclusion or share it as
            one.
          </li>
        </ul>
      </section>
    </>
  );
}

function DecisionsModule() {
  const q = useData("/decisions");
  const decisions: any[] = Array.isArray(q.data?.decisions)
    ? q.data.decisions
    : [];
  const appeals: any[] = Array.isArray(q.data?.appeals) ? q.data.appeals : [];
  const action = useAction();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState("all");
  const outcomes = uniqueValues(decisions, "outcome");
  const filtered = decisions.filter(
    (row) =>
      (outcome === "all" || row.outcome === outcome) &&
      matches(row, query, ["reference", "reason", "outcome"]),
  );
  const approved = decisions.filter((row) =>
    ["APPROVED", "PARTIALLY_APPROVED"].includes(row.outcome),
  );
  const approvedValue = approved.reduce(
    (total, row) => total + BigInt(row.approved_minor || 0),
    0n,
  );
  const openAppeals = appeals.filter((row) => row.status === "OPEN").length;
  return (
    <>
      <SectionHero
        eyebrow="Claims operations · Decision record"
        title="Decisions & appeals."
        text="Every insurer decision is a versioned, human-recorded fact. Appeals are reviewed separately and never overwrite the original decision."
        badge={{
          label: "Decisions recorded",
          value: decisions.length,
          note: "Insurer-controlled",
        }}
        actions={[
          { href: "/app/claims", label: "Claims queue", icon: ClipboardCheck },
          { href: "/app/flagged", label: "Flagged claims", icon: ShieldAlert },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Gavel,
            label: "Decisions",
            value: decisions.length,
            note: "Versioned record",
            tone: "navy",
          },
          {
            icon: CheckCircle2,
            label: "Approved or partial",
            value: approved.length,
            note: money(approvedValue) + " approved",
            tone: "green",
          },
          {
            icon: Inbox,
            label: "Information requested",
            value: decisions.filter(
              (row) => row.outcome === "NEEDS_INFORMATION",
            ).length,
            note: "Returned to facility",
            tone: "orange",
          },
          {
            icon: Scale,
            label: "Open appeals",
            value: openAppeals,
            note: `${appeals.length} appeal${appeals.length === 1 ? "" : "s"} total`,
            tone: openAppeals ? "red" : "",
          },
        ]}
      />
      <SectionPanel
        eyebrow="Decision log"
        title="Recorded outcomes"
        count={`${filtered.length} of ${decisions.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search claim or reason"
          chips={[
            { value: "all", label: "All outcomes" },
            ...outcomes.map((name) => ({
              value: name,
              label: humanize(name),
            })),
          ]}
          chip={outcome}
          setChip={setOutcome}
        />
        <SectionTable
          caption="Insurer decisions"
          rows={filtered}
          columns={[
            {
              label: "Claim",
              render: (row) => (
                <Link href={"/app/claims/" + row.claim_id}>
                  {row.reference}
                </Link>
              ),
            },
            {
              label: "Outcome",
              render: (row) => <Status value={row.outcome} />,
            },
            {
              label: "Approved value",
              render: (row) => money(row.approved_minor),
              align: "right",
            },
            {
              label: "Reason",
              render: (row) => (
                <span className="sec-clamp" title={row.reason}>
                  {row.reason || "No reason recorded"}
                </span>
              ),
            },
            {
              label: "Submission",
              render: (row) => "v" + row.submission_version,
            },
            { label: "Recorded", render: (row) => day(row.created_at) },
          ]}
          empty={
            <Empty
              title={
                decisions.length
                  ? "No decisions match this filter."
                  : "No decisions recorded yet."
              }
              text={
                decisions.length
                  ? "Clear the search or choose another outcome."
                  : "Insurer decisions appear here after a reviewer records an outcome. Approval is not settlement."
              }
            />
          }
        />
      </SectionPanel>
      <SectionPanel
        eyebrow="Separate review"
        title="Appeals"
        count={`${openAppeals} open`}
      >
        {appeals.length === 0 ? (
          <Empty
            title="No appeals recorded."
            text="A facility may appeal a decision. Appeals are reviewed separately and do not overwrite the original decision."
          />
        ) : (
          <div className="sec-cards">
            {appeals.map((row) => (
              <article className="sec-card" key={row.id}>
                <div className="sec-card-head">
                  <div>
                    <strong>{row.reference}</strong>
                    <small>Appeal {row.id.slice(0, 8)}</small>
                  </div>
                  <Status value={row.status} />
                </div>
                <p>{row.reason}</p>
                {row.status === "OPEN" ? (
                  <form
                    className="stack-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      await action.run(`/appeals/${row.id}/resolve`, {
                        resolution: new FormData(event.currentTarget).get(
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
                ) : (
                  <p className="sec-card-note">
                    Reviewed. The original decision remains in the record.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </SectionPanel>
      <Feedback action={action} />
    </>
  );
}

function CoverageModule() {
  const q = useData("/coverage");
  const action = useAction();
  const tariffs: any[] = Array.isArray(q.data?.tariffs) ? q.data.tariffs : [];
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState("all");
  const versions = [...new Set(tariffs.map((row) => String(row.version)))].sort(
    (a, b) => Number(b) - Number(a),
  );
  const latest = versions[0];
  const filtered = tariffs.filter(
    (row) =>
      (version === "all" || String(row.version) === version) &&
      matches(row, query, ["code", "description", "label"]),
  );
  const label = tariffs[0]?.label || "No catalogue published";
  const activeLabel =
    version === "all"
      ? label
      : tariffs.find((row) => String(row.version) === version)?.label || label;
  const codes = new Set(tariffs.map((row) => row.code)).size;
  return (
    <>
      <SectionHero
        eyebrow="Coverage & contracts · Insurer"
        title="Coverage & tariffs."
        text="The payer-controlled catalogue that bounds what a claim may be approved for. Tariff versions are immutable; new rules are published as a future version."
        badge={{
          label: "Current catalogue",
          value: latest ? "v" + latest : "—",
          note: "Not official medical codes",
        }}
        actions={[
          {
            href: "/app/contracts",
            label: "Contracted organizations",
            icon: Building2,
          },
          { href: "/app/claims", label: "Claims queue", icon: ClipboardCheck },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Layers3,
            label: "Catalogue versions",
            value: versions.length,
            note: "Immutable history",
            tone: "navy",
          },
          {
            icon: ShieldCheck,
            label: "Tariff codes",
            value: codes,
            note: "Across published versions",
          },
          {
            icon: BadgeDollarSign,
            label: "Highest unit cap",
            value: money(
              tariffs.reduce(
                (max, row) =>
                  row.max_unit_minor > max ? row.max_unit_minor : max,
                0,
              ),
            ),
            note: "Local pilot catalogue",
            tone: "green",
          },
          {
            icon: CalendarClock,
            label: "Effective now",
            value: tariffs.filter(
              (row) =>
                new Date(row.effective_from) <= new Date() &&
                new Date(row.effective_to) >= new Date(),
            ).length,
            note: "Item windows in force",
            tone: "orange",
          },
        ]}
      />
      <div className="notice">
        These are local pilot catalogue codes, not official medical codes. The
        insurer controls coverage and tariffs; LUX does not set or change
        either.
      </div>
      <SectionPanel
        eyebrow="Catalogue"
        title={activeLabel}
        count={`${filtered.length} of ${tariffs.length} items`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search code or description"
          chips={[
            { value: "all", label: "All versions" },
            ...versions.map((value) => ({
              value,
              label: "Version " + value + (value === latest ? " · latest" : ""),
            })),
          ]}
          chip={version}
          setChip={setVersion}
        />
        <SectionTable
          caption="Published tariff items"
          rows={filtered}
          columns={[
            {
              label: "Code",
              render: (row) => <span className="sec-mono">{row.code}</span>,
            },
            { label: "Description", render: (row) => row.description },
            {
              label: "Max unit",
              render: (row) => money(row.max_unit_minor, row.currency),
              align: "right",
            },
            { label: "Currency", render: (row) => row.currency },
            {
              label: "Version",
              render: (row) => "v" + row.version,
            },
            {
              label: "Effective",
              render: (row) =>
                day(row.effective_from) + " → " + day(row.effective_to),
            },
          ]}
          empty={
            <Empty
              title={
                tariffs.length
                  ? "No tariff items match this filter."
                  : "No tariff catalogue yet."
              }
              text={
                tariffs.length
                  ? "Clear the search or choose another version."
                  : "An insurer administrator must publish the first local pilot tariff version before claims can be validated against coverage."
              }
            />
          }
        />
      </SectionPanel>
      <SectionPanel
        eyebrow="Controlled change"
        title="Publish a new local pilot tariff version"
      >
        <p className="sec-panel-lede">
          A new version becomes the future catalogue without altering decisions
          already made against earlier versions.
        </p>
        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            try {
              await action.run("/coverage/tariffs", {
                label: data.label,
                effectiveFrom: data.from,
                effectiveTo: data.to,
                items: JSON.parse(String(data.items)),
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
      </SectionPanel>
      <Feedback action={action} />
    </>
  );
}

function ContractsModule() {
  const q = useData("/contracts");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const types = uniqueValues(rows, "type");
  const filtered = rows.filter(
    (row) =>
      (type === "all" || row.type === type) &&
      matches(row, query, ["name", "type"]),
  );
  const facilities = rows.filter((row) => row.type === "FACILITY").length;
  const insurers = rows.filter((row) => row.type === "INSURER").length;
  return (
    <>
      <SectionHero
        eyebrow="Coverage & contracts · Network"
        title="Contracted organizations."
        text="The facilities and insurers your organization may exchange claims with. A directory entry is not a coverage promise or a payment authorization."
        badge={{
          label: "Contracted counterpart",
          value: rows.length,
          note: "Scoped directory",
        }}
        actions={[
          {
            href: "/app/coverage",
            label: "Coverage & tariffs",
            icon: ShieldCheck,
          },
          { href: "/app/claims", label: "Claims", icon: FileText },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Building2,
            label: "Counterpart organizations",
            value: rows.length,
            note: "Visible to your access",
            tone: "navy",
          },
          {
            icon: HeartPulse,
            label: "Facilities",
            value: facilities,
            note: "Care providers",
            tone: "green",
          },
          {
            icon: ShieldCheck,
            label: "Insurers",
            value: insurers,
            note: "Coverage decision-makers",
            tone: "orange",
          },
          {
            icon: LinkIcon,
            label: "Directory status",
            value: rows.length ? "Linked" : "None",
            note: "Contract terms stay private",
          },
        ]}
      />
      <SectionPanel
        eyebrow="Network directory"
        title="Contracted counterparties"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search organization"
          chips={[
            { value: "all", label: "All types" },
            ...types.map((value) => ({ value, label: humanize(value) })),
          ]}
          chip={type}
          setChip={setType}
        />
        {filtered.length === 0 ? (
          <Empty
            title={
              rows.length ? "No organizations match." : "No contracts recorded."
            }
            text={
              rows.length
                ? "Clear the search or choose another organization type."
                : "Contracted facilities and insurers appear here once an authorized administrator records the relationship."
            }
          />
        ) : (
          <div className="sec-cards">
            {filtered.map((row) => (
              <article className="sec-card sec-org-card" key={row.id}>
                <span className="sec-card-icon">
                  {row.type === "INSURER" ? (
                    <ShieldCheck size={20} />
                  ) : (
                    <Building2 size={20} />
                  )}
                </span>
                <div className="sec-card-head">
                  <div>
                    <strong>{row.name}</strong>
                    <small>{humanize(row.type)}</small>
                  </div>
                  <span className="sec-tag">{humanize(row.type)}</span>
                </div>
                <p className="sec-card-note">
                  Contracted counterpart. Claim exchange is limited to
                  authorized users in your organization.
                </p>
              </article>
            ))}
          </div>
        )}
      </SectionPanel>
    </>
  );
}

function OrganizationsModule() {
  const q = useData("/admin/organizations");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const types = uniqueValues(rows, "type");
  const filtered = rows.filter(
    (row) =>
      (type === "all" || row.type === type) &&
      matches(row, query, ["name", "type", "status"]),
  );
  const active = rows.filter((row) => row.status === "ACTIVE").length;
  return (
    <>
      <SectionHero
        eyebrow="Network · Platform administration"
        title="Organizations."
        text="Every facility, insurer and platform organization on this demo network. Activation happens only through an approved organization request."
        badge={{
          label: "Network organizations",
          value: rows.length,
          note: "Synthetic demo records",
        }}
        actions={[
          {
            href: "/app/organization-requests",
            label: "Organization requests",
            icon: Send,
          },
          { href: "/app/contracts", label: "Contracts", icon: Building2 },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Building2,
            label: "Organizations",
            value: rows.length,
            note: "Across the network",
            tone: "navy",
          },
          {
            icon: HeartPulse,
            label: "Facilities",
            value: rows.filter((row) => row.type === "FACILITY").length,
            note: "Care providers",
            tone: "green",
          },
          {
            icon: ShieldCheck,
            label: "Insurers",
            value: rows.filter((row) => row.type === "INSURER").length,
            note: "Coverage decision-makers",
            tone: "orange",
          },
          {
            icon: CheckCircle2,
            label: "Active",
            value: active,
            note: `${rows.length - active} not active`,
          },
        ]}
      />
      <SectionPanel
        eyebrow="Network register"
        title="Organization directory"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search name, type or status"
          chips={[
            { value: "all", label: "All types" },
            ...types.map((value) => ({ value, label: humanize(value) })),
          ]}
          chip={type}
          setChip={setType}
        />
        {filtered.length === 0 ? (
          <Empty
            title={
              rows.length ? "No organizations match." : "No organizations yet."
            }
            text={
              rows.length
                ? "Clear the search or choose another organization type."
                : "Approved organization requests create the first active records."
            }
          />
        ) : (
          <div className="sec-cards">
            {filtered.map((row) => (
              <article className="sec-card sec-org-card" key={row.id}>
                <span className="sec-card-icon">
                  {row.type === "INSURER" ? (
                    <ShieldCheck size={20} />
                  ) : row.type === "LUX" ? (
                    <Sparkles size={20} />
                  ) : (
                    <Building2 size={20} />
                  )}
                </span>
                <div className="sec-card-head">
                  <div>
                    <strong>{row.name}</strong>
                    <small>Added {day(row.created_at)}</small>
                  </div>
                  <Status value={row.status} />
                </div>
                <div className="sec-card-tags">
                  <span className="sec-tag">{humanize(row.type)}</span>
                  {row.demo && <span className="sec-tag demo">Demo</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionPanel>
    </>
  );
}

function OrganizationRequestsModule() {
  const q = useData("/admin/organization-requests");
  const action = useAction();
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const statuses = uniqueValues(rows, "status");
  const kinds = uniqueValues(rows, "kind");
  const filtered = rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      (kind === "all" || row.kind === kind) &&
      matches(row, query, ["organization", "name", "email", "kind", "status"]),
  );
  const pending = rows.filter((row) => row.status === "PENDING");
  return (
    <>
      <SectionHero
        eyebrow="Network · Onboarding"
        title="Organization requests."
        text="Public facility and insurer enquiries that ask for network access. Approval is an explicit, audited action that creates an active organization."
        image="family-phone"
        badge={{
          label: "Awaiting decision",
          value: pending.length,
          note: "Reviewed by authorized staff",
        }}
        actions={[
          {
            href: "/app/organizations",
            label: "Organizations",
            icon: Building2,
          },
          { href: "/app/enquiries", label: "Public enquiries", icon: LifeBuoy },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Send,
            label: "Requests",
            value: rows.length,
            note: "All recorded requests",
            tone: "navy",
          },
          {
            icon: Clock3,
            label: "Pending review",
            value: pending.length,
            note: "Needs a decision",
            tone: pending.length ? "orange" : "green",
          },
          {
            icon: CheckCircle2,
            label: "Approved",
            value: rows.filter((row) => row.status === "APPROVED").length,
            note: "Active organization created",
          },
          {
            icon: XCircle,
            label: "Declined",
            value: rows.filter((row) => row.status === "DECLINED").length,
            note: "Reason recorded",
            tone: "red",
          },
        ]}
      />
      <SectionPanel
        eyebrow="Request queue"
        title="Recorded organization requests"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search organization, contact or email"
          chips={[
            { value: "all", label: "All statuses" },
            ...statuses.map((value) => ({ value, label: humanize(value) })),
          ]}
          chip={status}
          setChip={setStatus}
        />
        <div
          className="sec-inline-chips"
          role="group"
          aria-label="Filter by organization type"
        >
          <button
            type="button"
            className={"sec-chip" + (kind === "all" ? " active" : "")}
            aria-pressed={kind === "all"}
            onClick={() => setKind("all")}
          >
            All organization types
          </button>
          {kinds.map((value) => (
            <button
              type="button"
              key={value}
              className={"sec-chip" + (kind === value ? " active" : "")}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {humanize(value)}
            </button>
          ))}
        </div>
        <SectionTable
          caption="Organization access requests"
          rows={filtered}
          columns={[
            { label: "Organization", render: (row) => row.organization },
            {
              label: "Type",
              render: (row) => (
                <span className="sec-tag">{humanize(row.kind)}</span>
              ),
            },
            { label: "Contact", render: (row) => row.name },
            { label: "Email", render: (row) => row.email },
            { label: "Status", render: (row) => <Status value={row.status} /> },
            { label: "Received", render: (row) => day(row.created_at) },
          ]}
          empty={
            <Empty
              title={
                rows.length
                  ? "No requests match this filter."
                  : "No requests yet."
              }
              text={
                rows.length
                  ? "Clear the search or choose another status."
                  : "Facility and insurer onboarding requests from the public enquiry form appear here."
              }
            />
          }
        />
      </SectionPanel>
      {pending.length > 0 && (
        <SectionPanel
          eyebrow="Explicit approval"
          title="Requests awaiting your decision"
          count={`${pending.length} pending`}
        >
          <p className="sec-panel-lede">
            Reviewer independence is preserved: record a rationale and only
            approve requests you are authorized to decide.
          </p>
          <div className="sec-cards">
            {pending.map((row) => (
              <article className="sec-card" key={row.id}>
                <div className="sec-card-head">
                  <div>
                    <strong>{row.organization}</strong>
                    <small>
                      {humanize(row.kind)} · {row.name} · {row.email}
                    </small>
                  </div>
                  <Status value={row.status} />
                </div>
                <p className="sec-card-note">
                  Approval creates an active organization and records your
                  identity, rationale and timestamp in the audit history.
                </p>
                <form
                  className="stack-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await action.run(
                      `/admin/organization-requests/${row.id}/approve`,
                      {
                        reason: new FormData(event.currentTarget).get("reason"),
                      },
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
              </article>
            ))}
          </div>
        </SectionPanel>
      )}
      <Feedback action={action} />
    </>
  );
}

function EnquiriesModule() {
  const q = useData("/admin/enquiries");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const kinds = uniqueValues(rows, "kind");
  const statuses = uniqueValues(rows, "status");
  const filtered = rows.filter(
    (row) =>
      (kind === "all" || row.kind === kind) &&
      (status === "all" || row.status === status) &&
      matches(row, query, [
        "organization",
        "name",
        "email",
        "location",
        "message",
      ]),
  );
  return (
    <>
      <SectionHero
        eyebrow="Network · Public enquiries"
        title="Public enquiries."
        text="Messages from patients and prospective facilities. A recorded enquiry is not an account, a coverage promise or an email delivery confirmation."
        image="family-phone"
        badge={{
          label: "New enquiries",
          value: rows.filter((row) => row.status === "NEW").length,
          note: "Awaiting triage",
        }}
        actions={[
          {
            href: "/app/organization-requests",
            label: "Organization requests",
            icon: Send,
          },
          { href: "/app/support", label: "Support", icon: LifeBuoy },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: LifeBuoy,
            label: "Enquiries",
            value: rows.length,
            note: "Consented submissions",
            tone: "navy",
          },
          {
            icon: Clock3,
            label: "New",
            value: rows.filter((row) => row.status === "NEW").length,
            note: "Not yet triaged",
            tone: "orange",
          },
          {
            icon: Users,
            label: "Patients",
            value: rows.filter((row) => row.kind === "PATIENT").length,
            note: "Individual cover questions",
            tone: "green",
          },
          {
            icon: Building2,
            label: "Facilities",
            value: rows.filter((row) => row.kind === "FACILITY").length,
            note: "Network onboarding interest",
          },
        ]}
      />
      <div className="notice">
        No email-success is claimed from a stored enquiry. Contact details are
        shown only to authorized network staff and are never placed in public
        content.
      </div>
      <SectionPanel
        eyebrow="Inbox"
        title="Recorded enquiries"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search organization, contact, location or message"
          chips={[
            { value: "all", label: "All types" },
            ...kinds.map((value) => ({ value, label: humanize(value) })),
          ]}
          chip={kind}
          setChip={setKind}
        />
        <div
          className="sec-inline-chips"
          role="group"
          aria-label="Filter by enquiry status"
        >
          <button
            type="button"
            className={"sec-chip" + (status === "all" ? " active" : "")}
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            All statuses
          </button>
          {statuses.map((value) => (
            <button
              type="button"
              key={value}
              className={"sec-chip" + (status === value ? " active" : "")}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {humanize(value)}
            </button>
          ))}
        </div>
        <SectionTable
          caption="Public enquiries"
          rows={filtered}
          columns={[
            {
              label: "Type",
              render: (row) => (
                <span className="sec-tag">{humanize(row.kind)}</span>
              ),
            },
            { label: "Organization", render: (row) => row.organization },
            { label: "Contact", render: (row) => row.name },
            {
              label: "Reach",
              render: (row) => (
                <span className="sec-stack">
                  <span>{row.email}</span>
                  <small>{row.phone || "No phone supplied"}</small>
                </span>
              ),
            },
            { label: "Location", render: (row) => row.location || "—" },
            {
              label: "Message",
              render: (row) => (
                <span className="sec-clamp" title={row.message}>
                  {row.message}
                </span>
              ),
            },
            { label: "Status", render: (row) => <Status value={row.status} /> },
            { label: "Received", render: (row) => day(row.created_at) },
          ]}
          empty={
            <Empty
              title={
                rows.length
                  ? "No enquiries match this filter."
                  : "No enquiries yet."
              }
              text={
                rows.length
                  ? "Clear the search or choose another type or status."
                  : "Consented public enquiries appear here for network staff to triage."
              }
            />
          }
        />
      </SectionPanel>
    </>
  );
}

function IntegrationsModule() {
  const q = useData("/admin/integrations");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const enabled = rows.filter((row) => row.enabled).length;
  const demoOnly = rows.filter((row) => row.mode === "demo").length;
  return (
    <>
      <SectionHero
        eyebrow="Platform operations · Integrations"
        title="Integration health."
        text="The approved adapter boundaries for payment providers. Demo behaviour is labelled as simulated; no live Orange Money disbursement is claimed."
        badge={{
          label: "Providers configured",
          value: rows.length,
          note: enabled ? enabled + " enabled" : "None live",
        }}
        actions={[
          {
            href: "/app/jobs",
            label: "Validation operations",
            icon: SearchCheck,
          },
          { href: "/app/audit", label: "Audit history", icon: ShieldCheck },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Network,
            label: "Providers",
            value: rows.length,
            note: "Registered adapters",
            tone: "navy",
          },
          {
            icon: CheckCircle2,
            label: "Enabled",
            value: enabled,
            note: enabled ? "Live adapters" : "No live adapter",
            tone: enabled ? "green" : "orange",
          },
          {
            icon: Activity,
            label: "Demo mode",
            value: demoOnly,
            note: "Simulated only",
          },
          {
            icon: XCircle,
            label: "Live disbursement",
            value: rows.filter(
              (row) => row.capabilities?.liveBusinessDisbursement,
            ).length,
            note: "Not approved",
            tone: "red",
          },
        ]}
      />
      <div className="notice">
        Orange Money live business disbursement and event verification are not
        configured. No official marks or endorsements are implied. Secret values
        never appear here, and LUX never holds customer money.
      </div>
      <SectionPanel
        eyebrow="Adapter register"
        title="Provider configuration"
        count={`${rows.length} provider${rows.length === 1 ? "" : "s"}`}
      >
        {rows.length === 0 ? (
          <Empty
            title="No providers configured."
            text="Approved integration adapters appear here with their mode and capabilities. Until then, no payment can be represented as live."
          />
        ) : (
          <div className="sec-cards">
            {rows.map((row) => (
              <article className="sec-card" key={row.provider}>
                <div className="sec-card-head">
                  <div className="sec-icon-row">
                    <span className="sec-card-icon">
                      <Wallet size={20} />
                    </span>
                    <div>
                      <strong>{row.provider}</strong>
                      <small>Payment provider adapter</small>
                    </div>
                  </div>
                  <Status value={row.enabled ? "ENABLED" : "DISABLED"} />
                </div>
                <div className="sec-card-tags">
                  <span className="sec-tag">{row.mode?.toUpperCase()}</span>
                  {row.capabilities?.syntheticOnly && (
                    <span className="sec-tag demo">Synthetic only</span>
                  )}
                </div>
                <ul className="sec-capabilities">
                  <li className={row.capabilities?.feeSplit ? "on" : "off"}>
                    {row.capabilities?.feeSplit ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <XCircle size={15} />
                    )}
                    Fee split
                  </li>
                  <li
                    className={row.capabilities?.syntheticOnly ? "on" : "off"}
                  >
                    {row.capabilities?.syntheticOnly ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <XCircle size={15} />
                    )}
                    Synthetic transactions only
                  </li>
                  <li
                    className={
                      row.capabilities?.liveBusinessDisbursement ? "on" : "off"
                    }
                  >
                    {row.capabilities?.liveBusinessDisbursement ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <XCircle size={15} />
                    )}
                    Live business disbursement
                  </li>
                </ul>
                <p className="sec-card-note">
                  {row.capabilities?.liveBusinessDisbursement
                    ? "Live disbursement is enabled for this adapter."
                    : "Payments through this adapter are simulated. No real funds move and no customer PIN is collected."}
                </p>
              </article>
            ))}
          </div>
        )}
      </SectionPanel>
    </>
  );
}

function JobsModule() {
  const q = useData("/admin/jobs");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = uniqueValues(rows, "status");
  const filtered = rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      matches(row, query, ["type", "status", "last_error"]),
  );
  const dead = rows.filter((row) =>
    ["DEAD", "FAILED"].includes(row.status),
  ).length;
  return (
    <>
      <SectionHero
        eyebrow="Platform operations · Durable work"
        title="Validation operations."
        text="Durable jobs that validate claims and record findings. A job is an internal processing fact; it is not a coverage decision or a payment."
        badge={{
          label: "Jobs recorded",
          value: rows.length,
          note: "PostgreSQL-backed",
        }}
        actions={[
          {
            href: "/app/integrations",
            label: "Integration health",
            icon: Activity,
          },
          { href: "/app/claims", label: "Claims queue", icon: ClipboardCheck },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: Workflow,
            label: "Jobs",
            value: rows.length,
            note: "Most recent 100",
            tone: "navy",
          },
          {
            icon: Clock3,
            label: "Pending",
            value: rows.filter((row) => row.status === "PENDING").length,
            note: "Awaiting processing",
            tone: "orange",
          },
          {
            icon: CheckCircle2,
            label: "Completed",
            value: rows.filter((row) =>
              ["DONE", "COMPLETED"].includes(row.status),
            ).length,
            note: "Processed jobs",
            tone: "green",
          },
          {
            icon: AlertTriangle,
            label: "Needs investigation",
            value: dead,
            note: dead ? "Do not replay blindly" : "No failed jobs",
            tone: dead ? "red" : "",
          },
        ]}
      />
      <div className="notice">
        Jobs persist in PostgreSQL. DEAD jobs require investigation; do not
        replay an uncertain payment as a new transfer.
      </div>
      <SectionPanel
        eyebrow="Job queue"
        title="Durable validation work"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search job type, status or error"
          chips={[
            { value: "all", label: "All statuses" },
            ...statuses.map((value) => ({ value, label: humanize(value) })),
          ]}
          chip={status}
          setChip={setStatus}
        />
        <SectionTable
          caption="Durable validation jobs"
          rows={filtered}
          columns={[
            {
              label: "Job type",
              render: (row) => humanize(row.type),
            },
            {
              label: "Status",
              render: (row) => <Status value={row.status} />,
            },
            {
              label: "Attempts",
              render: (row) => row.attempts,
              align: "right",
            },
            {
              label: "Last error",
              render: (row) =>
                row.last_error ? (
                  <span className="sec-clamp" title={row.last_error}>
                    {row.last_error}
                  </span>
                ) : (
                  <span className="sec-muted">None</span>
                ),
            },
            { label: "Created", render: (row) => day(row.created_at) },
          ]}
          empty={
            <Empty
              title={
                rows.length ? "No jobs match this filter." : "No jobs queued."
              }
              text={
                rows.length
                  ? "Clear the search or choose another status."
                  : "Validation jobs are queued when a claim is submitted. Durable work appears here with its attempts and errors."
              }
            />
          }
        />
      </SectionPanel>
    </>
  );
}

function AuditModule() {
  const q = useData("/audit");
  const rows: any[] = Array.isArray(q.data) ? q.data : [];
  const [query, setQuery] = useState("");
  const [window, setWindow] = useState("all");
  const now = Date.now();
  const windowed = rows.filter((row) => {
    if (window === "24h")
      return now - new Date(row.created_at).getTime() <= 86_400_000;
    if (window === "7d")
      return now - new Date(row.created_at).getTime() <= 604_800_000;
    return true;
  });
  const filtered = windowed.filter((row) =>
    matches(row, query, ["action", "resource_id", "actor_id"]),
  );
  const actions = new Set(rows.map((row) => row.action)).size;
  const actors = new Set(rows.map((row) => row.actor_id).filter(Boolean)).size;
  return (
    <>
      <SectionHero
        eyebrow="Governance · Immutable history"
        title="Audit history."
        text="An append-only record of authorized actions in this organization. Audit entries explain who acted and when; they never contain secrets or a customer’s payment PIN."
        badge={{
          label: "Recent events",
          value: rows.length,
          note: "Newest first · last 100",
        }}
        actions={[
          { href: "/app/users", label: "Organization users", icon: Users },
          { href: "/app/settings", label: "Settings", icon: Settings },
        ]}
      />
      <SectionMetrics
        items={[
          {
            icon: ShieldCheck,
            label: "Events",
            value: rows.length,
            note: "Append-only record",
            tone: "navy",
          },
          {
            icon: Clock3,
            label: "Last 24 hours",
            value: rows.filter(
              (row) => now - new Date(row.created_at).getTime() <= 86_400_000,
            ).length,
            note: "Recent activity",
            tone: "orange",
          },
          {
            icon: Activity,
            label: "Distinct actions",
            value: actions,
            note: "Across this organization",
          },
          {
            icon: Users,
            label: "Actors",
            value: actors,
            note: "Human and system identities",
            tone: "green",
          },
        ]}
      />
      <SectionPanel
        eyebrow="Event log"
        title="Recorded actions"
        count={`${filtered.length} of ${rows.length}`}
      >
        <SectionToolbar
          query={query}
          setQuery={setQuery}
          placeholder="Search action, actor or resource"
          chips={[
            { value: "all", label: "All time" },
            { value: "7d", label: "Last 7 days" },
            { value: "24h", label: "Last 24 hours" },
          ]}
          chip={window}
          setChip={setWindow}
        />
        {filtered.length === 0 ? (
          <Empty
            title={
              rows.length
                ? "No events match this filter."
                : "No audit events yet."
            }
            text={
              rows.length
                ? "Clear the search or widen the time window."
                : "Authorized actions are recorded here as they happen."
            }
          />
        ) : (
          <ul className="sec-timeline">
            {filtered.map((row, index) => (
              <li key={row.id || index}>
                <span className="sec-timeline-dot" aria-hidden="true" />
                <div>
                  <strong>{humanize(row.action)}</strong>
                  <p>
                    {row.resource_id ? (
                      <>
                        Resource{" "}
                        <span className="sec-mono">
                          {String(row.resource_id).slice(0, 8)}
                        </span>
                      </>
                    ) : (
                      "Organization-level action"
                    )}
                    {row.actor_id ? (
                      <>
                        {" · "}Actor{" "}
                        <span className="sec-mono">
                          {String(row.actor_id).slice(0, 8)}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <time dateTime={row.created_at}>{date(row.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    </>
  );
}
