import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../features/auth-context';
import { Icon } from './icons/Icon';

type Notification = {
  id: string;
  template: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 20000;

/**
 * Header notification bell. The unread count is polled on an interval, which
 * keeps it working on serverless hosting where a long-lived stream is not
 * reliable. Opening the panel refreshes the list.
 */
export function NotificationBell() {
  const { signedIn } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const data = await apiGet<{ unread: number }>('/api/notifications/unread-count');
      setUnread(data.unread);
    } catch {
      /* signed out or offline; keep the last known count */
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: Notification[]; unread: number }>(
        '/api/notifications?limit=20',
      );
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setUnread(0);
      setItems([]);
      return;
    }
    void loadCount();
    const timer = setInterval(() => void loadCount(), POLL_MS);
    return () => clearInterval(timer);
  }, [signedIn, loadCount]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  if (!signedIn) return null;

  return (
    <details
      className="notify"
      ref={details}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="notify__badge">{unread > 99 ? '99+' : unread}</span>}
      </summary>
      <div className="notify__panel" role="region" aria-label="Recent notifications">
        <div className="notify__head">
          <strong>Notifications</strong>
          <button
            type="button"
            className="text-link"
            onClick={() =>
              void (async () => {
                await apiPost('/api/notifications/read-all', {});
                await loadList();
              })()
            }
          >
            Mark all read
          </button>
        </div>
        {items.length === 0 ? (
          <p className="notify__empty">No notifications yet.</p>
        ) : (
          <ul className="notify__list">
            {items.map((item) => (
              <li key={item.id} className={item.readAt ? '' : 'is-unread'}>
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (!item.readAt) {
                        await apiPost(`/api/notifications/${item.id}/read`, {});
                        await loadList();
                      }
                    })()
                  }
                >
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link className="text-link" to="/notifications" onClick={() => setOpen(false)}>
          View all notifications
        </Link>
      </div>
    </details>
  );
}
