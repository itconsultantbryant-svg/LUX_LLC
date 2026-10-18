import { randomUUID } from 'node:crypto';
import type pg from 'pg';

/**
 * In-app notifications.
 *
 * The existing `notifications` table already carries a channel, a template, a
 * JSON payload, a delivery status and a read timestamp, so it doubles as the
 * customer's in-app feed. `idempotency_key` is unique, which makes emission
 * safe to repeat inside retried transactions.
 */
export interface NotifyInput {
  userId: string;
  template: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: string;
  idempotencyKey?: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  channel: string;
  template: string;
  payload: Record<string, unknown>;
  status: string;
  read_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

export function notificationView(row: NotificationRow) {
  const payload = row.payload as { title?: string; body?: string; data?: unknown };
  return {
    id: row.id,
    template: row.template,
    title: payload.title ?? row.template,
    body: payload.body ?? '',
    data: payload.data ?? {},
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export class NotificationsService {
  async notify(client: pg.PoolClient, input: NotifyInput): Promise<NotificationRow | undefined> {
    return (
      await client.query<NotificationRow>(
        `INSERT INTO notifications(user_id,channel,template,payload,status,idempotency_key,delivered_at)
         VALUES($1,$2,$3,$4,'delivered',$5,now())
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          input.userId,
          input.channel ?? 'in_app',
          input.template,
          JSON.stringify({ title: input.title, body: input.body, data: input.data ?? {} }),
          input.idempotencyKey ?? randomUUID(),
        ],
      )
    ).rows[0];
  }

  async list(client: pg.PoolClient, userId: string, limit = 50): Promise<NotificationRow[]> {
    return (
      await client.query<NotificationRow>(
        `SELECT * FROM notifications WHERE user_id=$1
          ORDER BY created_at DESC, id DESC LIMIT $2`,
        [userId, Math.min(Math.max(limit, 1), 100)],
      )
    ).rows;
  }

  async unreadCount(client: pg.PoolClient, userId: string): Promise<number> {
    const row = (
      await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL',
        [userId],
      )
    ).rows[0];
    return Number(row?.count ?? 0);
  }

  async markRead(client: pg.PoolClient, userId: string, id: string): Promise<boolean> {
    const result = await client.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    return Boolean(result.rowCount);
  }

  async markAllRead(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(
      'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',
      [userId],
    );
  }
}
