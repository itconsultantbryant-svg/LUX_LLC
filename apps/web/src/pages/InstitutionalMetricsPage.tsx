import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';

type CountRow = { status: string; count: number };
type CountByMode = CountRow & { adapter_mode: string };
type Metrics = {
  counts: {
    bills: CountRow[];
    reviewCases: CountRow[];
    payments: CountByMode[];
    funding: CountByMode[];
    settlements: CountRow[];
    jobQueue: CountRow[];
  };
  ai: {
    aiRuns: { runs: number; bills: number; review_required: number };
    validators: { events: number; bills: number; error_findings: number; warning_findings: number };
  };
  recentEvents: Array<{ event_type: string; count: number }>;
  generatedAt: string;
  note: string;
};

export function InstitutionalMetricsPage() {
  const [data, setData] = useState<Metrics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiGet<Metrics>('/api/admin/metrics')
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  return (
    <section className="workspace flow-layout">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="sparkles" size={15} /> Institutional console
          </p>
          <h1>Journey metrics</h1>
          <p>
            Counts are computed from the platform database for the AI extraction, review, funding,
            and payment journey (M-01 / M-02 instrumentation).
          </p>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Loading metrics…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <div className="button-row">
            <button className="btn btn--ghost" onClick={() => setReload((v) => v + 1)}>
              Reload metrics
            </button>
            <Link className="text-link" to="/account/security">
              Security &amp; organization access
            </Link>
          </div>
        </Feedback>
      )}
      {data && (
        <>
          <aside className="panel">Generated {new Date(data.generatedAt).toLocaleString()}.</aside>
          <article className="panel">
            <h2>AI extraction &amp; validation</h2>
            <dl className="review-list">
              <div>
                <dt>Completed AI runs</dt>
                <dd>{data.ai.aiRuns.runs}</dd>
              </div>
              <div>
                <dt>Bills read</dt>
                <dd>{data.ai.aiRuns.bills}</dd>
              </div>
              <div>
                <dt>Runs flagged for review</dt>
                <dd>{data.ai.aiRuns.review_required}</dd>
              </div>
              <div>
                <dt>Validation findings</dt>
                <dd>{data.ai.validators.events}</dd>
              </div>
              <div>
                <dt>Error findings</dt>
                <dd>{data.ai.validators.error_findings}</dd>
              </div>
              <div>
                <dt>Warning findings</dt>
                <dd>{data.ai.validators.warning_findings}</dd>
              </div>
            </dl>
          </article>
          <Counts title="Bills" rows={data.counts.bills} />
          <Counts title="Review cases" rows={data.counts.reviewCases} />
          <Counts title="Payment intents" rows={data.counts.payments} />
          <Counts title="Funding payments" rows={data.counts.funding} />
          <Counts title="Partner settlements" rows={data.counts.settlements} />
          <Counts title="Job queue" rows={data.counts.jobQueue} />
          <article className="panel">
            <h2>Recent journey events</h2>
            {data.recentEvents.length === 0 && <p>No journey events recorded yet.</p>}
            <ul>
              {data.recentEvents.map((e) => (
                <li key={e.event_type}>
                  {e.event_type} · {e.count}
                </li>
              ))}
            </ul>
            <p>{data.note}</p>
          </article>
        </>
      )}
    </section>
  );
}

function Counts({ title, rows }: { title: string; rows: Array<CountRow | CountByMode> }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {rows.length === 0 && <p>No entries yet.</p>}
      <ul>
        {rows.map((row) => (
          <li key={`${'adapter_mode' in row ? row.adapter_mode : 'all'}:${row.status}`}>
            {row.status}
            {'adapter_mode' in row && row.adapter_mode ? ` · ${row.adapter_mode} mode` : ''} —{' '}
            {row.count}
          </li>
        ))}
      </ul>
    </article>
  );
}
