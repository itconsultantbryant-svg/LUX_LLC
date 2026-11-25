"use client";
import { useData, DataBoundary, Empty, Status, money, date } from "./workspace";

type Row = Record<string, any>;

function periodLabel(start?: string | null, end?: string | null) {
  if (!start || !end) return "";
  const format = new Intl.DateTimeFormat("en-LR", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Monrovia",
  });
  return format.format(new Date(start + "T12:00:00Z"));
}

function coverAmount(value: string | null | undefined, currency?: string) {
  if (value === null || value === undefined || !currency)
    return "Not published";
  return money(value, currency);
}

function CoverageCard({
  title,
  period,
  limit,
  used,
  pending,
  remaining,
  utilization,
  currency,
}: {
  title: string;
  period: string;
  limit: string | null;
  used: string;
  pending: string;
  remaining: string | null;
  utilization: number;
  currency?: string;
}) {
  const published = limit !== null && limit !== undefined;
  return (
    <article className="patient-cover">
      <div className="patient-cover-head">
        <div>
          <span>{period}</span>
          <strong>{title}</strong>
        </div>
        <span className="patient-cover-badge">
          {published ? `${Math.min(utilization, 100)}% used` : "Not published"}
        </span>
      </div>
      {published ? (
        <>
          <div className="patient-cover-amounts">
            <div>
              <span>Limit</span>
              <strong>{coverAmount(limit, currency)}</strong>
            </div>
            <div>
              <span>Used</span>
              <strong>{coverAmount(used, currency)}</strong>
            </div>
            <div>
              <span>Balance</span>
              <strong>{coverAmount(remaining, currency)}</strong>
            </div>
          </div>
          <div
            className="patient-meter"
            role="img"
            aria-label={`${title}: ${Math.min(utilization, 100)}% used`}
          >
            <span style={{ width: `${Math.min(utilization, 100)}%` }} />
          </div>
          <small>
            {BigInt(pending || 0) > 0n
              ? `${coverAmount(pending, currency)} is pending insurer review and is not deducted yet. `
              : ""}
            Used amounts are insurer-approved claims in this period.
          </small>
        </>
      ) : (
        <p className="patient-cover-empty">
          Your insurer has not published a structured limit for this period.
          Your claims history remains visible below.
        </p>
      )}
    </article>
  );
}

export function PatientCoverageCards({ coverage }: { coverage: Row }) {
  const monthly = coverage?.monthly || {};
  const annual = coverage?.annual || {};
  const currency = coverage?.currency || undefined;
  return (
    <div className="patient-cover-grid">
      <CoverageCard
        title="Monthly cover"
        period={periodLabel(monthly.periodStart, monthly.periodEnd)}
        limit={monthly.limitMinor ?? null}
        used={monthly.usedMinor || "0"}
        pending={monthly.pendingMinor || "0"}
        remaining={monthly.remainingMinor ?? null}
        utilization={Number(monthly.utilization || 0)}
        currency={currency}
      />
      <CoverageCard
        title="Annual cover"
        period={periodLabel(annual.periodStart, annual.periodEnd)}
        limit={annual.limitMinor ?? null}
        used={annual.usedMinor || "0"}
        pending={annual.pendingMinor || "0"}
        remaining={annual.remainingMinor ?? null}
        utilization={Number(annual.utilization || 0)}
        currency={currency}
      />
    </div>
  );
}

export function PatientClaimsTable({ rows }: { rows: Row[] }) {
  if (!rows?.length)
    return (
      <Empty
        title="No claims on record yet."
        text="Claims submitted by a participating facility will appear here after the insurer has received them."
      />
    );
  return (
    <div className="dash-table patient-claims">
      {rows.map((claim) => {
        const decided =
          claim.state === "APPROVED" || claim.state === "PARTIALLY_APPROVED";
        return (
          <div className="dash-table-row patient-claim-row" key={claim.id}>
            <span>
              <strong>{claim.reference}</strong>
              <small>
                {claim.facility_name} · {claim.service_date}
              </small>
            </span>
            <span className="dash-table-money">
              {money(
                decided ? claim.approved_minor : claim.submitted_minor,
                claim.currency,
              )}
            </span>
            <Status value={claim.state} />
            <small className="dash-table-time">
              {claim.payment_state
                ? claim.payment_state.replaceAll("_", " ").toLowerCase()
                : claim.decided_at
                  ? "Decision recorded"
                  : "Awaiting decision"}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function PatientTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="app-title">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function PatientCoverageModule() {
  const q = useData("/patient/coverage");
  return (
    <>
      <PatientTitle
        title="Coverage & balance"
        text="Your own cover, as published by your insurer. Facility and insurer activity refreshes automatically."
      />
      <DataBoundary loading={q.loading} error={q.error} retry={q.reload}>
        {q.data ? (
          <>
            <section className="panel">
              <h2>Coverage this period</h2>
              <p>
                {q.data.patient.insurerName} · policy{" "}
                {q.data.patient.policyReference}
              </p>
              <PatientCoverageCards coverage={q.data.coverage} />
              <p className="patient-disclaimer">
                {q.data.coverage.note} The insurer controls coverage decisions.
                An approved amount is not proof that payment has settled.
              </p>
            </section>
            <section className="panel">
              <h2>Policy record</h2>
              <dl className="patient-facts">
                <Fact label="Member reference">
                  {q.data.patient.memberReference}
                </Fact>
                <Fact label="Policy reference">
                  {q.data.patient.policyReference}
                </Fact>
                <Fact label="Coverage status">
                  <Status value={q.data.patient.coverageStatus} />
                </Fact>
                <Fact label="Policy effective">
                  {q.data.patient.effectiveFrom} to {q.data.patient.effectiveTo}
                </Fact>
                <Fact label="Insurer record updated">
                  {date(q.data.patient.sourceUpdatedAt)}
                </Fact>
                <Fact label="Facilities in your history">
                  {q.data.facilities?.length
                    ? q.data.facilities.join(", ")
                    : "No claim facilities yet"}
                </Fact>
                {Object.entries(q.data.patient.benefits || {}).map(
                  ([key, value]) => (
                    <Fact label={key.replaceAll("_", " ")} key={key}>
                      {typeof value === "string"
                        ? value
                        : JSON.stringify(value)}
                    </Fact>
                  ),
                )}
              </dl>
            </section>
            <section className="panel">
              <h2>Published limit history</h2>
              {q.data.history?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Currency</th>
                        <th>Monthly limit</th>
                        <th>Annual limit</th>
                        <th>Effective</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data.history.map((row: Row) => (
                        <tr key={row.version}>
                          <td>{row.version}</td>
                          <td>{row.currency}</td>
                          <td>
                            {money(row.monthly_limit_minor, row.currency)}
                          </td>
                          <td>{money(row.annual_limit_minor, row.currency)}</td>
                          <td>
                            {row.effective_from} to {row.effective_to}
                          </td>
                          <td>{date(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No structured limits published."
                  text="Your insurer has not yet published monthly and annual limits for this policy."
                />
              )}
            </section>
          </>
        ) : null}
      </DataBoundary>
    </>
  );
}

export function PatientClaimsModule() {
  const q = useData("/patient/claims");
  return (
    <>
      <PatientTitle
        title="Claims history"
        text="Claims submitted for your policy by participating facilities. Only your own records are shown."
      />
      <DataBoundary loading={q.loading} error={q.error} retry={q.reload}>
        {q.data ? (
          <>
            <div className="dash-metrics">
              <article className="dash-metric">
                <span>Total claims</span>
                <strong>{q.data.totals.total}</strong>
                <small>{q.data.totals.open} open with the insurer</small>
              </article>
              <article className="dash-metric green">
                <span>Approved claims</span>
                <strong>{q.data.totals.approved}</strong>
                <small>{q.data.totals.rejected} rejected</small>
              </article>
              <article className="dash-metric navy">
                <span>Approved value</span>
                <strong>
                  {coverAmount(
                    q.data.totals.approved_minor,
                    q.data.coverage.currency || undefined,
                  )}
                </strong>
                <small>Applied to your coverage balance</small>
              </article>
              <article className="dash-metric orange">
                <span>Recorded as settled</span>
                <strong>
                  {coverAmount(
                    q.data.totals.settled_minor,
                    q.data.coverage.currency || undefined,
                  )}
                </strong>
                <small>Only verified settlement records</small>
              </article>
            </div>
            <section className="panel">
              <h2>All claims</h2>
              <PatientClaimsTable rows={q.data.claims} />
              <p className="patient-disclaimer">
                A claim appears here after a facility submits it. Approval does
                not mean the facility has received funds. Updated{" "}
                {date(q.data.refreshedAt)}.
              </p>
            </section>
          </>
        ) : null}
      </DataBoundary>
    </>
  );
}

export function PatientSection({ section }: { section: string }) {
  if (section === "my-coverage") return <PatientCoverageModule />;
  if (section === "my-claims") return <PatientClaimsModule />;
  return (
    <Empty
      title="Patient portal"
      text="Choose overview, coverage or claims history from the sidebar."
    />
  );
}
