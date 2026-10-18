import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';

type Notification = {
  id: string;
  template: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const data = await apiGet<{ notifications: Notification[]; unread: number }>(
      '/api/notifications?limit=100',
    );
    setItems(data.notifications);
    setUnread(data.unread);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load notifications.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="bell" size={15} /> Activity
          </p>
          <h1>Notifications</h1>
          <p>{unread ? `${unread} unread` : 'You are all caught up.'}</p>
        </div>
        {unread > 0 && (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() =>
              void (async () => {
                await apiPost('/api/notifications/read-all', {});
                await load();
              })()
            }
          >
            Mark all read
          </button>
        )}
      </div>
      {loading && <Feedback kind="loading" title="Loading your notifications…" />}
      {error && <Feedback kind="error" title={error} />}
      {!loading && !error && items.length === 0 && (
        <Feedback kind="unavailable" title="No notifications yet">
          <Link className="btn btn--primary" to="/">
            Back home
          </Link>
        </Feedback>
      )}
      {items.length > 0 && (
        <article className="panel">
          <ul className="activity-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                {!item.readAt && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() =>
                      void (async () => {
                        await apiPost(`/api/notifications/${item.id}/read`, {});
                        await load();
                      })()
                    }
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
