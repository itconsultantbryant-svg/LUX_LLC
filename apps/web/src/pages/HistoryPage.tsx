import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemo, money } from '../features/demo';
import { Feedback } from '../components/Feedback';
export function HistoryPage() {
  const { state } = useDemo();
  const [filter, setFilter] = useState('All');
  const items = state.active
    ? state.activity.filter((item) => filter === 'All' || item.status === filter)
    : [];
  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your records</p>
          <h1>History</h1>
          <p>Follow your payments, savings, and support requests.</p>
        </div>
      </div>
      <article className="panel">
        <label htmlFor="history-filter">Show activity</label>
        <select
          id="history-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          {['All', 'Completed', 'Pending'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <p role="status" className="muted">
          {items.length} {items.length === 1 ? 'record' : 'records'} shown
          {state.active ? ' · synthetic data' : ''}
        </p>
        {items.length ? (
          <ul className="activity-list">
            {items.map((item) => (
              <li key={item.id}>
                <details>
                  <summary>
                    {item.title} · {money(item.amount)}{' '}
                    <span
                      className={`badge badge--${item.status === 'Pending' ? 'pending' : 'success'}`}
                    >
                      {item.status}
                    </span>
                  </summary>
                  <p>{item.detail}</p>
                  <p>
                    Demo reference HW-{String(item.id).padStart(4, '0')} ·{' '}
                    {item.status === 'Pending'
                      ? 'Not available to spend.'
                      : 'Recorded in your demo wallet.'}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <Feedback title={filter === 'All' ? 'No activity yet' : 'No matching activity'}>
            <p>
              {filter === 'All'
                ? 'Your first payment, savings contribution, or support request will appear here.'
                : 'Choose another filter to see more records.'}
            </p>
            <Link className="text-link" to="/">
              Return home →
            </Link>
          </Feedback>
        )}
      </article>
    </section>
  );
}
