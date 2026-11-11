"use client";
import Link from "next/link";
import {
  useWorkspace,
  useData,
  DataBoundary,
  Empty,
  money,
  date,
  Status,
} from "../../components/workspace";
export default function Overview() {
  const { me, org } = useWorkspace();
  const { data, error, loading, reload } = useData("/overview");
  const allowed = org.permissions.some((p) =>
    ["claims", "review", "payments.read"].includes(p),
  );
  return (
    <>
      <div className="app-title">
        <div>
          <span className="eyebrow">Your connected workspace</span>
          <h1>A clearer view of what’s next.</h1>
          <p>
            Amounts reflect current authorized records. Times shown in
            Africa/Monrovia.
          </p>
        </div>
        {org.type === "FACILITY" && org.permissions.includes("claims") && (
          <Link className="button" href="/app/claims/new">
            + Prepare a claim
          </Link>
        )}
      </div>
      <DataBoundary loading={loading} error={error} retry={reload}>
        {data && (
          <>
            <div className="stats-grid">
              {[
                [
                  "Submitted",
                  data.counts
                    .filter((r: any) =>
                      ["SUBMITTED", "VALIDATING"].includes(r.state),
                    )
                    .reduce((n: number, r: any) => n + r.count, 0),
                  "Waiting for validation",
                ],
                [
                  "Awaiting review",
                  data.counts.find((r: any) => r.state === "AWAITING_REVIEW")
                    ?.count || 0,
                  "Human insurer decision required",
                ],
                [
                  "Returned",
                  data.counts.find((r: any) => r.state === "NEEDS_INFORMATION")
                    ?.count || 0,
                  "Information requested",
                ],
                [
                  "Approved",
                  data.counts
                    .filter((r: any) =>
                      ["APPROVED", "PARTIALLY_APPROVED"].includes(r.state),
                    )
                    .reduce((n: number, r: any) => n + r.count, 0),
                  "Approval is not settlement",
                ],
              ].map(([label, count, note]) => (
                <div className="stat" key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <div className="app-two-grid">
              <section className="panel">
                <h2>
                  {org.type === "LUX"
                    ? "Operations, not clinical access"
                    : "Amounts by currency"}
                </h2>
                {data.money.length ? (
                  data.money.map((m: any) => (
                    <div key={m.currency}>
                      <span className="eyebrow">
                        {m.currency} · No currency conversion
                      </span>
                      <dl className="key-values">
                        <div>
                          <dt>Submitted</dt>
                          <dd>{money(m.submitted, m.currency)}</dd>
                        </div>
                        <div>
                          <dt>Insurer approved</dt>
                          <dd>{money(m.approved, m.currency)}</dd>
                        </div>
                        <div>
                          <dt>Confirmed settled</dt>
                          <dd>
                            {money(
                              data.settlements.find(
                                (s: any) => s.currency === m.currency,
                              )?.settled,
                              m.currency,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Unknown / investigation</dt>
                          <dd>
                            {money(
                              data.settlements.find(
                                (s: any) => s.currency === m.currency,
                              )?.unknown,
                              m.currency,
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))
                ) : (
                  <>
                    <p>
                      No claim amounts are available in this organization
                      context. Platform administrators do not inherit clinical
                      access.
                    </p>
                    {org.permissions.includes("organizations") && (
                      <Link
                        className="text-link"
                        href="/app/organization-requests"
                      >
                        Review organization requests →
                      </Link>
                    )}
                    {org.permissions.includes("fees") && (
                      <Link className="text-link" href="/app/fees">
                        Review earned service revenue →
                      </Link>
                    )}
                  </>
                )}
              </section>
              <section className="panel">
                <h2>Notifications</h2>
                {data.notifications.length ? (
                  data.notifications.map((n: any) => (
                    <div className="notification" key={n.id}>
                      <Link href={n.link}>{n.title}</Link>
                      <small>{date(n.created_at)}</small>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="You’re up to date."
                    text="New authorized workflow notifications will appear here."
                  />
                )}
              </section>
            </div>
            <section className="panel">
              <h2>Responsibilities stay clear.</h2>
              <p>
                The facility prepares records. LUX assists with completeness and
                consistency. The insurer decides and authorizes. Settlement
                requires verified transaction evidence.
              </p>
              <span className="badge demo">
                {me.mode === "demo"
                  ? "Synthetic demonstration only"
                  : "Configured integration boundaries apply"}
              </span>
            </section>
          </>
        )}
      </DataBoundary>
    </>
  );
}
