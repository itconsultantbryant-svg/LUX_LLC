# Incident response

How to detect, triage, contain, and learn from an incident. This is the process
layer; the concrete commands live in [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
and [MONITORING.md](./MONITORING.md).

The platform handles health and payment data, so two classes of incident are
treated most seriously: **any suspected data exposure** and **any suspected
payment/financial corruption**. When unsure, treat it as one of these.

## 1. Severity levels

| Severity | Definition                                         | Response time    | Examples                                            |
| -------- | -------------------------------------------------- | ---------------- | --------------------------------------------------- |
| SEV-1    | Data exposure, payment corruption, or total outage | immediate        | `/ready` down; unexpected data access; ledger drift |
| SEV-2    | Major function broken, no data loss                | < 1 hour         | Payments failing; sign-in broken; jobs not running  |
| SEV-3    | Degraded or single-user impact                     | < 1 business day | One provider can't confirm bills; a stuck job       |
| SEV-4    | Cosmetic / informational                           | next triage      | Copy or layout defect                               |

## 2. Roles

Assign these per incident; one person may hold several in a small team.

- **Incident lead** — owns the timeline and decisions.
- **Operator** — runs the runbook commands (Neon, Vercel, admin API).
- **Communicator** — updates customers/partners on a cadence.
- **Scribe** — records timestamps and actions for the review.

## 3. Lifecycle

### Detect

Signals come from `/health` and `/ready`, log alerts, `job_queue` staleness, the
admin metrics/incidents views, or a human report. See
[MONITORING.md](./MONITORING.md) §6 for thresholds.

### Triage (first 15 minutes)

1. Confirm scope: which environment, which subsystem, which users.
2. Check `/ready` (database) and `/health` (adapters) before anything else.
3. Pick a severity (§1) and start a timeline.
4. Decide containment (§4). Do **not** debug in production without containment
   if data or money may still be moving.

### Contain

Use the least disruptive control that stops the damage:

- **Disable a subsystem without a deploy** with a kill-switch flag
  (`payments`, `ai_extraction`, `partner_modules`) via `PUT /api/admin/flags/:key`.
  Every change is audited.
- **Roll back** the frontend and/or function (see
  [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md) §4).
- **Rotate** `ORIGIN_SECRET`, payment callback secret, or provider credentials if
  a secret may have leaked. Rotate the proxy secret on both sides together.
- **Restore** only as a last resort, into a new database first.

### Recover

- `pnpm worker:reconcile` to clear stale quotes/payments and release
  reservations. Reconciliation adjusts platform state only and **never fabricates
  partner settlement**.
- Re-run `/ready` and `node deploy/verify-demo.mjs <origin>`.
- Confirm jobs are flowing again (`job_queue` no longer stuck).
- Verify the specific function that failed with `pnpm test:journey`.

### Review (within 5 business days)

- Timeline, root cause, blast radius, and the controls that worked or didn't.
- Actions with owners and due dates; link the fixing change.
- Update this doc and the runbook if the response exposed a gap.
- For data or payment incidents, record the customer/partner notification.

## 4. Playbooks (quick index)

| Incident                     | Contain                                                       | Reference                           |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| Database down / unready      | Check Neon; fail over/restore if needed                       | Runbook §2; `MONITORING.md`         |
| Suspected payment corruption | Disable `payments`; capture `payment-incidents`; reconcile    | Runbook §4                          |
| Suspected data exposure      | Disable affected flag; rotate secrets; review audit trail     | Runbook §4; `SECURITY_HARDENING.md` |
| Provider callback storm      | Callbacks are exempt from rate limiting; dedupe/inspect queue | Runbook §4                          |
| Provider fraud               | Fraud-escalation route; suspend provider                      | Runbook §4                          |
| Stuck background jobs        | Inspect `job_queue`; run worker; reset stuck work             | `MONITORING.md` §3                  |
| Failed deploy                | Roll back frontend and/or function                            | `BACKUP_AND_ROLLBACK.md` §4         |
| Leaked secret                | Rotate on both sides; review access logs                      | `SECURITY_HARDENING.md` §3          |

## 5. Communication

- **Internal:** post in the incident channel at detection, containment, and
  resolution; keep the timeline current.
- **Customers/partners:** only the Communicator speaks. State impact and
  expected next update; never speculate on cause. For data incidents, provide
  what happened, what data was involved, and what the person should do.
- **Regulatory/partners:** follow the pilot agreement's notification windows
  (see [PILOT_PROPOSAL.md](./PILOT_PROPOSAL.md)).

## 6. Contacts

Fill in before a pilot starts; keep this list in the deployment's own controlled
docs if names must not be committed.

| Role                 | Name | Contact | Escalation |
| -------------------- | ---- | ------- | ---------- |
| Incident lead        |      |         |            |
| On-call operator     |      |         |            |
| Platform admin       |      |         |            |
| Neon support         |      |         |            |
| Vercel support       |      |         |            |
| Orange Money liaison |      |         |            |
| DPO / privacy        |      |         |            |

## 7. Post-incident record

For every SEV-1 and SEV-2, record: severity, start/end (UTC), impact, detection
signal, root cause, containment, recovery, and follow-up actions. Store it
alongside the deployment's operational records so drills and audits can find it.
