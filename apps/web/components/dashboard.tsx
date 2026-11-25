"use client";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Gavel,
  HeartPulse,
  Inbox,
  Layers3,
  LifeBuoy,
  MapPin,
  Network,
  ReceiptText,
  SearchCheck,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  useData,
  useWorkspace,
  DataBoundary,
  Empty,
  Status,
  money,
  date,
} from "./workspace";
import { PatientCoverageCards, PatientClaimsTable } from "./patient";

type Row = Record<string, any>;
type Segment = { label: string; value: number; color: string };

const COLORS = [
  "#f97316",
  "#071a40",
  "#2f9e82",
  "#e5b34a",
  "#7c8aa5",
  "#c2410c",
  "#3b82f6",
];

function total(rows: Row[], key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}
function stateCount(rows: Row[], state: string) {
  return Number(rows.find((row) => row.state === state)?.count || 0);
}
function currencyAmount(rows: Row[], key: string, currency = "USD") {
  return String(rows.find((row) => row.currency === currency)?.[key] || "0");
}
function label(value: string) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const height = 52;
  const step = 100 / Math.max(values.length - 1, 1);
  const line = values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"} ${index * step} ${height - 6 - (value / max) * (height - 12)}`,
    )
    .join(" ");
  return (
    <svg
      className="dash-sparkline"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="spark-area"
        d={`${line} L 100 ${height} L 0 ${height} Z`}
      />
      <path className="spark-line" d={line} />
    </svg>
  );
}

function BarChart({
  trend,
  primary,
  secondary,
}: {
  trend: Row[];
  primary: string;
  secondary?: string;
}) {
  const max = Math.max(
    ...trend.map((day) =>
      Math.max(Number(day[primary] || 0), Number(day[secondary || ""] || 0)),
    ),
    1,
  );
  return (
    <div
      className="dash-bars"
      role="img"
      aria-label={`14 day trend for ${primary.replaceAll("_", " ")}`}
    >
      {trend.map((day) => {
        const high = (Number(day[primary] || 0) / max) * 100;
        const low = secondary ? (Number(day[secondary] || 0) / max) * 100 : 0;
        return (
          <div
            className="dash-bar-col"
            key={day.day}
            title={`${day.day}: ${day[primary]} ${primary}${
              secondary ? `, ${day[secondary]} ${secondary}` : ""
            }`}
          >
            <div className="dash-bar-track">
              {secondary && (
                <span
                  className="dash-bar secondary"
                  style={{ height: `${Math.max(low, 2)}%` }}
                />
              )}
              <span
                className="dash-bar primary"
                style={{ height: `${Math.max(high, 2)}%` }}
              />
            </div>
            <small>{String(day.day).slice(8)}</small>
          </div>
        );
      })}
    </div>
  );
}

function Donut({
  segments,
  center,
  sub,
}: {
  segments: Segment[];
  center: string;
  sub: string;
}) {
  const sum = segments.reduce((value, segment) => value + segment.value, 0);
  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      cursor += (segment.value / Math.max(sum, 1)) * 100;
      return `${segment.color} ${start}% ${cursor}%`;
    })
    .join(", ");
  return (
    <div className="dash-donut-wrap">
      <div
        className="dash-donut"
        role="img"
        aria-label={`${center} ${sub}`}
        style={{
          background: sum
            ? `conic-gradient(${stops})`
            : "conic-gradient(#e8edf5 0 100%)",
        }}
      >
        <div className="dash-donut-center">
          <strong>{center}</strong>
          <small>{sub}</small>
        </div>
      </div>
      <ul className="dash-legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span style={{ background: segment.color }} />
            <span>{label(segment.label)}</span>
            <strong>{segment.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({
  icon: Icon,
  label: text,
  value,
  note,
  tone = "",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note: string;
  tone?: string;
}) {
  return (
    <article className={"dash-metric " + tone}>
      <span className="dash-metric-icon">
        <Icon size={18} />
      </span>
      <span>{text}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"dash-panel " + className}>
      <header>
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action && (
          <Link className="dash-panel-link" href={action.href}>
            {action.label} <ArrowUpRight size={14} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function Hero({
  eyebrow,
  title,
  text,
  image,
  actions,
  badge,
}: {
  eyebrow: string;
  title: string;
  text: string;
  image: string;
  actions: { href: string; label: string; icon: LucideIcon }[];
  badge: { label: string; value: string };
}) {
  return (
    <section className="dash-hero">
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
      </div>
      <div className="dash-hero-badge">
        <small>{badge.label}</small>
        <strong>{badge.value}</strong>
        <span>
          <Activity size={13} /> Live from authorized records
        </span>
      </div>
    </section>
  );
}

function QueueItem({
  href,
  label: text,
  value,
  note,
  icon: Icon,
  tone = "",
}: {
  href: string;
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <Link className={"dash-queue-item " + tone} href={href}>
      <span className="dash-queue-icon">
        <Icon size={17} />
      </span>
      <span>
        <strong>{text}</strong>
        <small>{note}</small>
      </span>
      <span className="dash-queue-value">{value}</span>
    </Link>
  );
}

function RecentClaims({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return <Empty title="No claims yet." text="New claims will appear here." />;
  return (
    <div className="dash-table">
      {rows.map((claim) => (
        <Link
          className="dash-table-row"
          href={"/app/claims/" + claim.id}
          key={claim.id}
        >
          <span>
            <strong>{claim.reference}</strong>
            <small>{claim.counterparty}</small>
          </span>
          <span className="dash-table-money">
            {money(claim.submitted_minor, claim.currency)}
          </span>
          <Status value={claim.state} />
          <small className="dash-table-time">{date(claim.updated_at)}</small>
        </Link>
      ))}
    </div>
  );
}

function ActivityFeed({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty title="No activity recorded yet." />;
  return (
    <ul className="dash-activity">
      {rows.map((event, index) => (
        <li key={event.resource_id || event.action + index}>
          <span className="dash-activity-dot" />
          <span>
            <strong>{label(event.action)}</strong>
            <small>
              {event.actor || "Authorized system"} · {date(event.created_at)}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function MoneySplit({ moneyRows }: { moneyRows: Row[] }) {
  const submitted = BigInt(currencyAmount(moneyRows, "submitted"));
  const approved = BigInt(currencyAmount(moneyRows, "approved"));
  const percent = submitted > 0n ? Number((approved * 100n) / submitted) : 0;
  return (
    <div className="dash-money">
      <div>
        <span>Submitted value</span>
        <strong>{money(submitted, "USD")}</strong>
      </div>
      <div>
        <span>Insurer-approved value</span>
        <strong>{money(approved, "USD")}</strong>
      </div>
      <div className="dash-progress" aria-label={`${percent}% approved`}>
        <span style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <small>
        {percent}% of submitted value has an insurer-approved amount. Approval
        is not proof of settlement.
      </small>
    </div>
  );
}

function PatientDashboard({ data }: { data: Row }) {
  const patient = data.patient || {};
  const totals = data.totals || {};
  const coverage = data.coverage || {};
  const currency = coverage.currency || undefined;
  const monthly = coverage.monthly || {};
  const annual = coverage.annual || {};
  const amount = (value: string | null | undefined) =>
    value === null || value === undefined || !currency
      ? "Not published"
      : money(value, currency);
  const firstName = String(patient.displayName || "there").split(" ")[0];
  return (
    <>
      <Hero
        eyebrow={`Patient portal · ${patient.insurerName || "Your insurer"}`}
        title={`Your cover, ${firstName}.`}
        text="See your own claims, monthly and annual cover, used balance and remaining balance as facilities and your insurer update their records."
        image="family-phone"
        actions={[
          {
            href: "/app/my-coverage",
            label: "Coverage & balance",
            icon: ShieldCheck,
          },
          {
            href: "/app/my-claims",
            label: "Claims history",
            icon: FileText,
          },
        ]}
        badge={{
          label: "Claims on record",
          value: String(totals.total || 0),
        }}
      />

      <div className="dash-metrics">
        <Metric
          icon={FileText}
          label="Total claims"
          value={totals.total || 0}
          note={`${totals.open || 0} open · ${totals.approved || 0} approved`}
        />
        <Metric
          icon={ShieldCheck}
          label="Monthly balance"
          value={amount(monthly.remainingMinor)}
          note={
            coverage.published
              ? `${monthly.utilization || 0}% of the monthly limit used`
              : "Your insurer has not published a monthly limit"
          }
          tone="orange"
        />
        <Metric
          icon={TrendingUp}
          label="Annual balance"
          value={amount(annual.remainingMinor)}
          note={
            coverage.published
              ? `${annual.utilization || 0}% of the annual limit used`
              : "Your insurer has not published an annual limit"
          }
          tone="navy"
        />
        <Metric
          icon={CheckCircle2}
          label="Approved value"
          value={currency ? money(totals.approved_minor || "0", currency) : "—"}
          note="Approved against cover, not proof of payment"
          tone="green"
        />
      </div>

      <div className="dash-grid dash-grid-wide">
        <Panel
          eyebrow="Your cover"
          title="Monthly and annual balance"
          action={{ href: "/app/my-coverage", label: "Details" }}
        >
          <PatientCoverageCards coverage={coverage} />
          <p className="dash-panel-note">{coverage.note}</p>
        </Panel>
        <Panel
          eyebrow="Latest activity"
          title="Recent claims"
          action={{ href: "/app/my-claims", label: "See all" }}
        >
          <PatientClaimsTable rows={data.recentClaims || []} />
        </Panel>
      </div>

      <div className="dash-grid">
        <Panel eyebrow="Policy record" title="Your insured details">
          <dl className="patient-facts">
            <div>
              <dt>Insurer</dt>
              <dd>{patient.insurerName || "—"}</dd>
            </div>
            <div>
              <dt>Policy reference</dt>
              <dd>{patient.policyReference || "—"}</dd>
            </div>
            <div>
              <dt>Member reference</dt>
              <dd>{patient.memberReference || "—"}</dd>
            </div>
            <div>
              <dt>Coverage status</dt>
              <dd>
                <Status value={patient.coverageStatus || "UNKNOWN"} />
              </dd>
            </div>
            <div>
              <dt>Last refreshed</dt>
              <dd>{date(data.refreshedAt)}</dd>
            </div>
          </dl>
          <p className="dash-panel-note">
            The insurer controls coverage and decisions. LUX shows the record;
            it does not hold patient money or collect a payment PIN.
          </p>
        </Panel>
        <Panel eyebrow="How it updates" title="Real-time claim visibility">
          <ul className="patient-update-list">
            <li>
              A facility submits a claim after care. It appears in your history
              as awaiting the insurer.
            </li>
            <li>
              An insurer decision changes the claim state and applies approved
              amounts to your monthly and annual cover.
            </li>
            <li>
              This page refreshes automatically every 20 seconds and whenever
              you return to the tab.
            </li>
          </ul>
          <p className="dash-panel-note">
            Only records linked to your own patient reference and insurer policy
            are returned. No other patient, facility workspace or insurer
            workspace is visible.
          </p>
        </Panel>
      </div>
    </>
  );
}

function OrgDashboard({ data }: { data: Row }) {
  const { org } = useWorkspace();
  const facility = org.type === "FACILITY";
  const queue = data.queues || {};
  const openClaims = data.counts
    .filter((row: Row) =>
      [
        "SUBMITTED",
        "VALIDATING",
        "AWAITING_REVIEW",
        "NEEDS_INFORMATION",
      ].includes(row.state),
    )
    .reduce((sum: number, row: Row) => sum + Number(row.count), 0);
  const settled = data.settlements.reduce(
    (sum: number, row: Row) => sum + Number(row.settled || 0),
    0,
  );
  const unknown = data.settlements.reduce(
    (sum: number, row: Row) => sum + Number(row.unknown || 0),
    0,
  );
  const approved = Number(currencyAmount(data.money, "approved"));
  const paymentSegments: Segment[] = data.paymentStates.map(
    (row: Row, index: number) => ({
      label: row.state,
      value: Number(row.count),
      color: COLORS[index % COLORS.length],
    }),
  );
  const heroImage = facility ? "hero-doctor-patient" : "team-at-work";
  const actions = facility
    ? [
        { href: "/app/claims/new", label: "Prepare a claim", icon: FileText },
        {
          href: "/app/encounters",
          label: "Record encounter",
          icon: HeartPulse,
        },
        {
          href: "/app/eligibility",
          label: "Check eligibility",
          icon: ShieldCheck,
        },
        { href: "/app/payments", label: "View payments", icon: Wallet },
      ]
    : [
        {
          href: "/app/claims",
          label: "Open review queue",
          icon: ClipboardCheck,
        },
        { href: "/app/flagged", label: "Review exceptions", icon: ShieldAlert },
        { href: "/app/payments", label: "Authorize payments", icon: Wallet },
        { href: "/app/coverage", label: "Coverage catalogue", icon: Layers3 },
      ];
  return (
    <>
      <Hero
        eyebrow={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"} · ${facility ? "Facility workspace" : "Insurance workspace"}`}
        title={facility ? "Facility overview." : "Insurance desk overview."}
        text={
          facility
            ? "Prepare evidence-backed claims, follow every decision, and keep settlement status visible without holding patient money."
            : "Review coverage-controlled claims, record insurer decisions, and keep maker and checker duties separate."
        }
        image={heroImage}
        actions={actions}
        badge={{
          label: facility ? "Open claims" : "Awaiting review",
          value: String(
            facility ? openClaims : stateCount(data.counts, "AWAITING_REVIEW"),
          ),
        }}
      />

      <div className="dash-metrics">
        <Metric
          icon={FileText}
          label="Claims in view"
          value={total(data.counts, "count")}
          note={`${openClaims} open · ${stateCount(data.counts, "DRAFT")} draft`}
        />
        <Metric
          icon={facility ? Inbox : SearchCheck}
          label={facility ? "Returned to you" : "Awaiting review"}
          value={facility ? queue.returned || 0 : queue.awaiting_review || 0}
          note={facility ? "Needs more information" : "In the insurer queue"}
          tone="orange"
        />
        <Metric
          icon={CheckCircle2}
          label="Approved value"
          value={money(approved)}
          note="Insurer-approved, not settled"
          tone="navy"
        />
        <Metric
          icon={Banknote}
          label="Settled value"
          value={money(settled)}
          note={`${money(unknown)} awaiting reliable status`}
          tone="green"
        />
      </div>

      <div className="dash-grid dash-grid-wide">
        <Panel
          eyebrow="Last 14 days"
          title="Claim volume"
          action={{ href: "/app/claims", label: "Open claims" }}
        >
          <div className="dash-chart-head">
            <div>
              <strong>{total(data.trend, "submitted")} claims</strong>
              <small>
                {total(data.trend, "approved")} approved in the same period
              </small>
            </div>
            <Sparkline
              values={data.trend.map((row: Row) => Number(row.submitted))}
            />
          </div>
          <BarChart
            trend={data.trend}
            primary="submitted"
            secondary="approved"
          />
          <div className="dash-chart-legend">
            <span>
              <i className="legend-primary" /> Submitted
            </span>
            <span>
              <i className="legend-secondary" /> Approved
            </span>
          </div>
        </Panel>
        <Panel
          eyebrow="Payment lifecycle"
          title="Where payments stand"
          action={{ href: "/app/payments", label: "Payments" }}
        >
          <Donut
            segments={paymentSegments}
            center={String(total(data.paymentStates, "count"))}
            sub="payments"
          />
        </Panel>
      </div>

      <div className="dash-grid">
        <Panel eyebrow="Live workload" title="Your work queue">
          <div className="dash-queue">
            {facility ? (
              <>
                <QueueItem
                  href="/app/returned"
                  label="Returned claims"
                  value={queue.returned || 0}
                  note="Insurer requested more information"
                  icon={Inbox}
                  tone="orange"
                />
                <QueueItem
                  href="/app/eligibility"
                  label="Eligibility checks"
                  value={stateCount(data.counts, "DRAFT")}
                  note="Draft claims still need evidence"
                  icon={ShieldCheck}
                />
                <QueueItem
                  href="/app/payments"
                  label="Payment records"
                  value={total(data.paymentStates, "count")}
                  note="Simulated settlement records"
                  icon={Wallet}
                />
                <QueueItem
                  href="/app/reconciliation"
                  label="Statement exceptions"
                  value={queue.open_exceptions || 0}
                  note="Require an evidence-backed resolution"
                  icon={ReceiptText}
                  tone="red"
                />
              </>
            ) : (
              <>
                <QueueItem
                  href="/app/claims"
                  label="Awaiting review"
                  value={queue.awaiting_review || 0}
                  note="Claims ready for an insurer decision"
                  icon={ClipboardCheck}
                  tone="orange"
                />
                <QueueItem
                  href="/app/flagged"
                  label="Flagged for review"
                  value={queue.flagged || 0}
                  note="Possible inconsistency — not a fraud verdict"
                  icon={ShieldAlert}
                  tone="red"
                />
                <QueueItem
                  href="/app/payments"
                  label="Awaiting authorization"
                  value={queue.awaiting_authorization || 0}
                  note="Maker requests needing a checker"
                  icon={Wallet}
                />
                <QueueItem
                  href="/app/decisions"
                  label="Open appeals"
                  value={queue.open_appeals || 0}
                  note="Decisions awaiting a review outcome"
                  icon={Gavel}
                />
              </>
            )}
          </div>
        </Panel>
        <Panel
          eyebrow="Latest activity"
          title="Recent claims"
          action={{ href: "/app/claims", label: "See all" }}
        >
          <RecentClaims rows={data.recentClaims} />
        </Panel>
      </div>

      <div className="dash-grid">
        <Panel eyebrow="Value in motion" title="Approved and settled">
          <MoneySplit moneyRows={data.money} />
          <div className="dash-settlement-strip">
            <div>
              <span>Settled</span>
              <strong>{money(settled)}</strong>
            </div>
            <div>
              <span>Needs status inquiry</span>
              <strong>{money(unknown)}</strong>
            </div>
            <div>
              <span>Open exceptions</span>
              <strong>{queue.open_exceptions || 0}</strong>
            </div>
          </div>
        </Panel>
        <Panel
          eyebrow="Traceable actions"
          title="Activity trail"
          action={{ href: "/app/audit", label: "Audit" }}
        >
          <ActivityFeed rows={data.auditFeed} />
        </Panel>
      </div>
    </>
  );
}

function AdminDashboard({ data }: { data: Row }) {
  const { me } = useWorkspace();
  const admin = data.admin;
  const totals = admin.totals || {};
  const claimSegments: Segment[] = admin.claimStates.map(
    (row: Row, index: number) => ({
      label: row.state,
      value: Number(row.count),
      color: COLORS[index % COLORS.length],
    }),
  );
  const paymentSegments: Segment[] = admin.paymentStates.map(
    (row: Row, index: number) => ({
      label: row.state,
      value: Number(row.count),
      color: COLORS[index % COLORS.length],
    }),
  );
  const feeTotal = Number(admin.fees?.total || 0);
  const feeSegments: Segment[] = [
    {
      label: "LUX allocation",
      value: Number(admin.fees?.lux || 0),
      color: "#f97316",
    },
    {
      label: "Orange allocation",
      value: Number(admin.fees?.orange || 0),
      color: "#071a40",
    },
  ];
  const jobTotal = total(admin.jobs, "count");
  const firstName = String(me.user.name || "there").split(" ")[0];
  return (
    <>
      <Hero
        eyebrow="LUX command centre"
        title={`Platform overview, ${firstName}.`}
        text="One view of the network: organizations, claim flow, insurer decisions, settlement states, fee evidence and the work that keeps the pilot moving."
        image="team-at-work"
        actions={[
          {
            href: "/app/organizations",
            label: "Organizations",
            icon: Building2,
          },
          {
            href: "/app/organization-requests",
            label: "Onboarding queue",
            icon: Send,
          },
          { href: "/app/fees", label: "Fee revenue", icon: BadgeDollarSign },
          { href: "/app/jobs", label: "Validation ops", icon: SearchCheck },
        ]}
        badge={{
          label: "Active organizations",
          value: String(totals.organizations || 0),
        }}
      />

      <div className="dash-metrics dash-metrics-five">
        <Metric
          icon={Network}
          label="Network"
          value={totals.organizations || 0}
          note={`${totals.facilities || 0} facilities · ${totals.insurers || 0} insurers`}
        />
        <Metric
          icon={FileText}
          label="Claims"
          value={totals.claims || 0}
          note={`${totals.awaiting_review || 0} awaiting insurer review`}
          tone="navy"
        />
        <Metric
          icon={Clock3}
          label="Pending onboarding"
          value={totals.pending_requests || 0}
          note={`${totals.enquiries || 0} public enquiries recorded`}
          tone="orange"
        />
        <Metric
          icon={ShieldAlert}
          label="Open exceptions"
          value={totals.exceptions || 0}
          note={`${totals.unknown || 0} payments need status inquiry`}
          tone="red"
        />
        <Metric
          icon={BadgeDollarSign}
          label="Assessed fees"
          value={money(feeTotal)}
          note={`${admin.fees?.assessments || 0} settlement assessments`}
          tone="green"
        />
      </div>

      <div className="dash-grid dash-grid-wide">
        <Panel
          eyebrow="Network volume · 14 days"
          title="Claims across the platform"
          action={{ href: "/app/reports", label: "Reports" }}
        >
          <div className="dash-chart-head">
            <div>
              <strong>{total(admin.trend, "claims")} claims</strong>
              <small>
                All facilities and insurers in the synthetic network
              </small>
            </div>
            <Sparkline
              values={admin.trend.map((row: Row) => Number(row.claims))}
            />
          </div>
          <BarChart trend={admin.trend} primary="claims" />
          <div className="dash-chart-legend">
            <span>
              <i className="legend-primary" /> Claims created
            </span>
          </div>
        </Panel>
        <Panel eyebrow="Claim states" title="Review pipeline">
          <Donut
            segments={claimSegments}
            center={String(totals.claims || 0)}
            sub="claims"
          />
        </Panel>
      </div>

      <div className="dash-grid dash-grid-three">
        <Panel eyebrow="Settlement lifecycle" title="Payment states">
          <Donut
            segments={paymentSegments}
            center={String(totals.payments || 0)}
            sub="payments"
          />
        </Panel>
        <Panel eyebrow="Evidence-backed split" title="Fee assessment">
          <Donut
            segments={feeSegments}
            center={money(feeTotal)}
            sub="assessed fees"
          />
          <p className="dash-panel-note">
            Accrued allocations are not proof of cash distribution. LUX revenue
            excludes Orange’s share and facility principal.
          </p>
        </Panel>
        <Panel eyebrow="Durable work" title="Operational health">
          <div className="dash-health">
            <div>
              <span>
                <SearchCheck size={15} /> Validation jobs
              </span>
              <strong>{totals.pending_jobs || 0} queued</strong>
              <small>
                {jobTotal} total · {totals.dead_jobs || 0} dead
              </small>
            </div>
            <div>
              <span>
                <LifeBuoy size={15} /> Support
              </span>
              <strong>{totals.open_support || 0} open</strong>
              <small>Operational requests only</small>
            </div>
            <div>
              <span>
                <ShieldCheck size={15} /> Team content
              </span>
              <strong>{totals.published_team || 0} published</strong>
              <small>Approved biographies only</small>
            </div>
            <div>
              <span>
                <Activity size={15} /> Integrations
              </span>
              <strong>
                {admin.integrations.some(
                  (row: Row) => row.mode === "live" && row.enabled,
                )
                  ? "Live mode present"
                  : "Demo mode only"}
              </strong>
              <small>No live Orange Money payout contracted</small>
            </div>
          </div>
        </Panel>
      </div>

      <div className="dash-grid">
        <Panel
          eyebrow="Network leaders"
          title="Claims by partner"
          action={{ href: "/app/organizations", label: "Organizations" }}
        >
          <div className="dash-rank">
            <h3>Insurers</h3>
            {admin.topInsurers.map((row: Row) => (
              <div className="dash-rank-row" key={row.name}>
                <span>{row.name}</span>
                <div>
                  <i
                    style={{
                      width: `${
                        (Number(row.claims) /
                          Math.max(
                            ...admin.topInsurers.map((r: Row) =>
                              Number(r.claims),
                            ),
                            1,
                          )) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <strong>{row.claims}</strong>
              </div>
            ))}
            <h3>Facilities</h3>
            {admin.topFacilities.map((row: Row) => (
              <div className="dash-rank-row" key={row.name}>
                <span>{row.name}</span>
                <div>
                  <i
                    style={{
                      width: `${
                        (Number(row.claims) /
                          Math.max(
                            ...admin.topFacilities.map((r: Row) =>
                              Number(r.claims),
                            ),
                            1,
                          )) *
                        100
                      }%`,
                    }}
                  />
                </div>
                <strong>{row.claims}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          eyebrow="Onboarding"
          title="Requests awaiting review"
          action={{ href: "/app/organization-requests", label: "Review" }}
        >
          {admin.pendingRequests.length ? (
            <div className="dash-requests">
              {admin.pendingRequests.map((row: Row) => (
                <Link
                  className="dash-request"
                  href="/app/organization-requests"
                  key={row.id}
                >
                  <span>
                    <strong>{row.organization}</strong>
                    <small>
                      {row.name} · {label(row.kind)} · {date(row.created_at)}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No pending organization requests." />
          )}
          <div className="dash-support-strip">
            <span>
              <Inbox size={15} /> {totals.enquiries || 0} enquiries
            </span>
            <span>
              <Users size={15} /> {admin.roleSummary.length} role types active
            </span>
          </div>
        </Panel>
      </div>

      <div className="dash-grid">
        <Panel
          eyebrow="Newest tenants"
          title="Recent organizations"
          action={{ href: "/app/organizations", label: "All organizations" }}
        >
          <div className="dash-table">
            {admin.recentOrganizations.map((org: Row) => (
              <div className="dash-table-row" key={org.id}>
                <span>
                  <strong>{org.name}</strong>
                  <small>{label(org.type)}</small>
                </span>
                <Status value={org.status} />
                <small className="dash-table-time">
                  {date(org.created_at)}
                </small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          eyebrow="Platform audit"
          title="Latest authorized actions"
          action={{ href: "/app/audit", label: "Audit history" }}
        >
          <ul className="dash-activity">
            {admin.auditFeed.map((event: Row, index: number) => (
              <li key={event.resource_id || event.action + index}>
                <span className="dash-activity-dot" />
                <span>
                  <strong>{label(event.action)}</strong>
                  <small>
                    {event.organization || "Platform"} ·{" "}
                    {event.actor || "System"} · {date(event.created_at)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel eyebrow="Role coverage" title="Active memberships by role">
        <div className="dash-roles">
          {admin.roleSummary.map((row: Row) => (
            <div className="dash-role" key={row.role}>
              <span>{label(row.role)}</span>
              <div>
                <i
                  style={{
                    width: `${
                      (Number(row.count) /
                        Math.max(
                          ...admin.roleSummary.map((r: Row) => Number(r.count)),
                          1,
                        )) *
                      100
                    }%`,
                  }}
                />
              </div>
              <strong>{row.count}</strong>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function Dashboard() {
  const { org } = useWorkspace();
  const { data, error, loading, reload } = useData("/overview");
  return (
    <DataBoundary loading={loading} error={error} retry={reload}>
      {data ? (
        org.type === "PATIENT" ? (
          <PatientDashboard data={data} />
        ) : org.type === "LUX" && data.admin ? (
          <AdminDashboard data={data} />
        ) : (
          <OrgDashboard data={data} />
        )
      ) : null}
    </DataBoundary>
  );
}
