import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { useDemo, money } from '../features/demo';
const workspaces = {
  provider: {
    name: 'Provider',
    intro: 'Review care bills and follow payment requests.',
    metric: 'Awaiting payment',
    value: 'LRD 8,000.00',
    queue: 'Care bills',
    action: 'Record demo bill review',
    items: ['Demo consultation bill', 'Demo diagnostic bill'],
  },
  reviewer: {
    name: 'Administrator / reviewer',
    intro: 'Review support requests with a clear decision trail.',
    metric: 'Needs review',
    value: '2 requests',
    queue: 'Review queue',
    action: 'Record demo eligibility review',
    items: ['Demo consultation support', 'Demo medication support'],
  },
  sponsor: {
    name: 'Organization / sponsor',
    intro: 'Monitor care support and restricted allocations.',
    metric: 'Unallocated demo budget',
    value: 'LRD 25,000.00',
    queue: 'Support allocations',
    action: 'Record demo allocation review',
    items: ['Demo community care allocation', 'Demo employee care allocation'],
  },
  partner: {
    name: 'Partner',
    intro: 'View aggregate service activity without customer medical details.',
    metric: 'Demo service availability',
    value: 'Illustrative only',
    queue: 'Service reports',
    action: 'Acknowledge demo report',
    items: ['Demo settlement summary', 'Demo availability summary'],
  },
};
type WorkspaceKey = keyof typeof workspaces;
export function InstitutionalPage() {
  const { role } = useParams();
  const { allowed, state, dispatch } = useDemo();
  const workspace =
    role && Object.hasOwn(workspaces, role) ? workspaces[role as WorkspaceKey] : null;
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState('queue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (selected) reviewHeading.current?.focus();
  }, [selected]);
  async function record() {
    if (busy) return;
    setError('');
    if (!navigator.onLine) {
      setError('You are offline. Reconnect and retry. No review was recorded.');
      return;
    }
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (selected) {
      setCompleted((items) => [...items, selected]);
      setNotice(`Demo review recorded for ${selected}. No live record was changed.`);
      setSelected(null);
    }
    setBusy(false);
  }
  if (!workspace)
    return (
      <section className="workspace">
        <p className="eyebrow">Institutional access</p>
        <h1>A workspace for your team</h1>
        <p>Providers, reviewers, sponsors, and partners use organization-assigned access.</p>
        <Feedback kind="unavailable" title="Sign in with your organization invitation">
          <p>
            Your organization must provision your access. Phone verification and an authenticator
            are required. Choosing a preview does not grant a role or permission.
          </p>
          <Link className="btn btn--primary" to="/account/security">
            Verified organization access
          </Link>
        </Feedback>
        <div className="button-row">
          <Link className="btn btn--ghost" to="/institutional/provider">
            Provider portal
          </Link>
          <Link className="text-link" to="/institutional/provider-verification">
            Authorized provider verification
          </Link>
        </div>
        {allowed && (
          <>
            <h2>Explore synthetic workspaces</h2>
            <p>Preview a layout with fictional records. No institutional access is granted.</p>
            <div className="institution-grid">
              {Object.entries(workspaces).map(([key, item]) => (
                <Link
                  className="panel institution-card"
                  key={key}
                  to={`/institutional/${key}`}
                  onClick={() => {
                    if (!state.active) dispatch({ type: 'start' });
                  }}
                >
                  <h3>{item.name}</h3>
                  <p>{item.intro}</p>
                  <span className="text-link">Preview workspace →</span>
                </Link>
              ))}
            </div>
          </>
        )}
        <Link className="text-link" to="/">
          ← Customer home
        </Link>
      </section>
    );
  const remaining = workspace.items.filter((item) => !completed.includes(item));
  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Institutional workspace</p>
          <h1>{workspace.name}</h1>
          <p>{workspace.intro}</p>
        </div>
        <Link className="btn btn--ghost" to="/institutional">
          Change workspace
        </Link>
      </div>
      {!allowed || !state.active ? (
        <Feedback kind="unavailable" title="Workspace unavailable">
          <p>
            Institutional access requires a provisioned account. Live institutional services are not
            connected.
          </p>
          <Link className="text-link" to="/institutional">
            Return to institutional access
          </Link>
        </Feedback>
      ) : (
        <div className="institution-shell">
          <nav className="workspace-nav" aria-label="Workspace sections">
            <button
              className={view === 'queue' ? 'selected' : ''}
              aria-pressed={view === 'queue'}
              onClick={() => setView('queue')}
            >
              {workspace.queue}
            </button>
            <button
              className={view === 'records' ? 'selected' : ''}
              aria-pressed={view === 'records'}
              onClick={() => setView('records')}
            >
              Review log ({completed.length})
            </button>
            <Link to="/status">Service status</Link>
          </nav>
          <div className="workspace">
            <span className="badge badge--pending">Synthetic preview · no role granted</span>
            <div className="metrics-grid">
              <article className="panel metric-panel">
                <div className="metric-panel__icon">
                  <Icon name="clock" size={22} />
                </div>
                <div>
                  <p>{workspace.metric}</p>
                  <strong className="metric-value">
                    {role === 'reviewer' ? `${remaining.length} requests` : workspace.value}
                  </strong>
                </div>
              </article>
              <article className="panel metric-panel">
                <div className="metric-panel__icon">
                  <Icon name="check-circle" size={22} />
                </div>
                <div>
                  <p>Reviewed in this workspace</p>
                  <strong className="metric-value">{completed.length}</strong>
                </div>
              </article>
            </div>
            <article className="panel">
              <h2>{view === 'queue' ? workspace.queue : 'Review log'}</h2>
              {(view === 'queue' ? remaining : completed).length ? (
                <ul className="institution-list">
                  {(view === 'queue' ? remaining : completed).map((item) => (
                    <li key={item}>
                      <div>
                        <strong>{item}</strong>
                        <small>
                          {role === 'partner'
                            ? 'Aggregate example · no personal data'
                            : `${money(400000)} · fictional record`}
                        </small>
                      </div>
                      {view === 'queue' ? (
                        <button
                          className="btn btn--ghost"
                          disabled={busy}
                          onClick={() => {
                            setSelected(item);
                            setNotice('');
                            setError('');
                          }}
                        >
                          Review<span className="sr-only"> {item}</span>
                        </button>
                      ) : (
                        <span className="badge badge--success">Reviewed</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <Feedback title={view === 'queue' ? 'All caught up' : 'No reviews yet'}>
                  <p>
                    {view === 'queue'
                      ? 'There are no more demo records to review.'
                      : 'Completed reviews will appear here during this workspace visit.'}
                  </p>
                </Feedback>
              )}
            </article>
            {selected && (
              <article className="panel" aria-label="Review details">
                <h2 ref={reviewHeading} tabIndex={-1}>
                  {selected}
                </h2>
                <p>
                  This fictional record demonstrates the review process. No payment, eligibility
                  decision, or allocation will be sent to a backend.
                </p>
                <div className="button-row">
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void record()}
                  >
                    {busy ? 'Recording demo review…' : workspace.action}
                  </button>
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => {
                      setSelected(null);
                      setNotice('Review cancelled. Nothing changed.');
                    }}
                  >
                    Cancel review
                  </button>
                </div>
                {error && <Feedback kind="error" title={error} />}
              </article>
            )}
            <div aria-live="polite">{notice && <Feedback kind="success" title={notice} />}</div>
          </div>
        </div>
      )}
    </section>
  );
}
