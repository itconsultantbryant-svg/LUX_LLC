# Monitoring

What to watch, how to watch it, and what "healthy" looks like. The platform is
stateless at the edge; all durable signals live in Neon, so monitoring is:
endpoint health checks, structured logs (errors), and the `job_queue` table
(background jobs).

Existing runtime-incident playbooks live in
[OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md); this document is the
monitoring layer above them.

## 1. Health checks

| Check     | Endpoint      | Frequency | Healthy                    | On failure                               |
| --------- | ------------- | --------- | -------------------------- | ---------------------------------------- |
| Liveness  | `GET /health` | 60s       | HTTP 200, `status: ok`     | Page on-call; check the function deploy. |
| Readiness | `GET /ready`  | 30s       | HTTP 200, `database: true` | Page on-call; Neon may be unavailable.   |

Configure both against the public origin (the same origin the browser uses, so
the Vercel Edge Middleware and function are covered end to end). `/ready` pings
the database and returns `503` when it cannot; use it for load-balancer/monitor
readiness and `/health` for liveness (a restart will not fix a down database).

`/health` also reports the active adapter modes. Alert if, in a non-demo
environment, any adapter reports `sandbox` unexpectedly, or if `simulation` is
`true` where it should be `false`.

Also verify the invariants `/ready` and `/health` cannot see, with the demo
smoke test:

```bash
node deploy/verify-demo.mjs https://YOUR-ORIGIN
```

## 2. Error monitoring

Errors are emitted as **structured logs** by Fastify/Pino (JSON, one line per
event) with request IDs. Secrets are redacted at the logger
(`apps/api/src/app.ts`): cookies, `authorization`, `set-cookie`, and `x-secret`.

Baseline with no extra tooling:

```bash
# Stream the function logs (Neon)
neon logs                 # follow the deployed function's logs
```

Recommended: attach a **log drain / error tracker** (for example a Sentry-style
service, or your hosting provider's log drain) that:

- groups 5xx responses by route and release,
- alerts on any uncaught exception (`error` level),
- alerts on spikes in `429` (rate limiting) and `403` (origin/session rejection),
- never receives request bodies, cookies, or `x-secret` (already redacted).

Signals to watch in logs:

| Signal                         | Meaning                                       |
| ------------------------------ | --------------------------------------------- |
| `ready_check_failed`           | Database ping failed.                         |
| `reconcile_worker_failed`      | Reconciliation job errored (see §3).          |
| `retention_worker_failed`      | Retention job errored (see §3).               |
| `error` level with stack trace | Unhandled exception; triage immediately.      |
| 5xx rate rise                  | Check `/ready`, then recent function deploys. |

The API never logs request bodies or secrets; do not add logging that does.

## 3. Background-job monitoring

Two scheduled workers run outside the request path:

| Worker             | Purpose                                             | Suggested cadence |
| ------------------ | --------------------------------------------------- | ----------------- |
| `worker:reconcile` | Expire stale quotes/payments, release reservations  | every 15 minutes  |
| `worker:retention` | Purge transient records past their retention window | daily             |

They are not HTTP endpoints. Run them from a scheduler (GitHub Actions schedule,
a small cron container, or your platform's scheduled jobs). Both print a single
line of JSON with a report and exit non-zero on failure. See
[`.github/workflows/scheduled-ops.yml`](../.github/workflows/scheduled-ops.yml)
for a ready-to-enable schedule.

Both workers also **enqueue** work into the `job_queue` table, and reconciliation
records its outcome there. Monitor the queue directly:

```sql
-- Jobs stuck or failing
SELECT job_type, status, COUNT(*) AS count, MAX(attempts) AS max_attempts
FROM job_queue
GROUP BY job_type, status
ORDER BY status, job_type;

-- Jobs that have failed or retried too often
SELECT id, job_type, status, attempts, last_error, updated_at
FROM job_queue
WHERE status <> 'done' AND (attempts >= 3 OR updated_at < now() - interval '1 hour')
ORDER BY updated_at;
```

Alert when:

- any job has `status = 'failed'`, or
- `attempts >= 3`, or
- a `pending` job has `updated_at` older than its expected processing window
  (a stuck queue) — `job_queue.updated_at` is the freshness signal.

The same counts are exposed for humans at `GET /api/admin/metrics` (requires an
administrator session) under `counts.jobQueue`, alongside bill, payment,
funding, settlement and AI counts.

## 4. Financial and reconciliation signals

Reconciliation is the safety net for money movement. Confirm it is actually
running by watching:

- `GET /api/admin/reconcile` — the last deterministic reconciliation report.
- `GET /api/admin/payment-incidents` — open/investigating incidents.
- `GET /api/admin/metrics` — `counts.payments`, `counts.funding`,
  `counts.settlements` by status; a growing count of non-terminal statuses is a
  warning.

No live partner settlement is asserted anywhere in the platform; sandbox
settlements remain "expected" until partner interfaces are confirmed.

## 5. Backup monitoring

Backups are only useful if they succeed and restore. Monitor:

- backup job exit code (non-zero = alert),
- the age of the newest backup artifact (alert if older than the schedule),
- the quarterly restore drill (see [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)).

## 6. Suggested alert thresholds

| Alert                         | Threshold                                    | Severity |
| ----------------------------- | -------------------------------------------- | -------- |
| `/ready` failing              | 2 consecutive checks                         | page     |
| `/health` failing             | 2 consecutive checks                         | page     |
| Uncaught exception            | any                                          | page     |
| Failed `job_queue` jobs       | any `status='failed'`                        | ticket   |
| Stuck `pending` jobs          | `updated_at` > 1h old                        | ticket   |
| Newest backup age             | greater than the backup schedule             | ticket   |
| 5xx rate                      | > 1% over 5 min                              | page     |
| Sandbox adapter in production | adapter mode `sandbox` where `live` expected | ticket   |
