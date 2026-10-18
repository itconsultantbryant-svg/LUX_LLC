# Administrator guide

For **Platform administrators** and authorized reviewers. It covers first-run
bootstrap, everyday operations, and the controls that must be handled with care.
Roles and their permissions are defined once in
[ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md); this guide is the
"how", not a second copy of the matrix.

All `/api/admin/*` routes require a **platform administrator** session (fresh
MFA). Every action is written to the audit trail.

## 1. First-run bootstrap

There is no self-registration path to administrator. Provision the first
administrator with the operator-only script against an existing account that has
a **verified-phone session** and an **enrolled authenticator**:

```bash
DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" \
  node apps/api/scripts/bootstrap-platform-admin.mjs <user-uuid>
```

The script refuses to run if a platform administrator already exists, revokes
that user's sessions (forcing a fresh MFA sign-in), and records an audit event.
After the first administrator exists, all further role changes go through the
authorized role-management API.

**Development shortcut.** In a non-production environment you can seed a
ready-to-use administrator without a manual MFA enrolment:

```bash
pnpm seed:admin            # default phone +999700000009
pnpm seed:admin +2317...   # or a specific E.164 phone
```

It grants `customer`, `reviewer`, and `platform_admin`, creates an 8-hour
sandbox session with MFA already verified, prints the `hw_session` cookie for
the reviewer console (`/institutional/reviews`, `/institutional/metrics`), and
refuses to run against production or a non-dev database. It never fabricates
funds or settlement.

## 2. Access and onboarding

| Task                    | Endpoint                                    |
| ----------------------- | ------------------------------------------- |
| View pending onboarding | `GET /api/admin/onboarding`                 |
| Review an organization  | `POST /api/admin/organizations/:id/reviews` |
| Review a user           | `POST /api/admin/users/:id/reviews`         |
| Grant/revoke access     | `PATCH /api/admin/users/:id/access`         |
| Assign or remove roles  | `POST /api/admin/users/:id/roles`           |

Least privilege: grant the narrowest role that fits (see the matrix §1). Provider
and organization access is scoped to the organization, not the individual.

## 3. Providers

| Task                       | Endpoint                                |
| -------------------------- | --------------------------------------- |
| List providers             | `GET /api/admin/providers`              |
| Approve/suspend a provider | `POST /api/admin/providers/:id/reviews` |

Providers self-register a profile; an administrator (or reviewer) changes
verification status. Suspending a provider stops new bill confirmations from that
organization without deleting history.

## 4. Bills, validation, and review

| Task                        | Endpoint                                       |
| --------------------------- | ---------------------------------------------- |
| Inspect a bill's validation | `GET /api/admin/bills/:id/validation`          |
| Apply a validation action   | `POST /api/admin/bills/:id/validation/actions` |
| List validation appeals     | `GET /api/admin/validation/appeals`            |
| List review cases           | `GET /api/admin/reviews`                       |
| Decide a review case        | `POST /api/admin/reviews/:id/:decision`        |
| Escalate suspected fraud    | `POST /api/admin/bills/:id/fraud-escalation`   |

The AI proposes; a human decides anything the routing rules send to review
(`await_review`, `await_provider`, `needs_correction`). Never bypass human review
by default (matrix §3). Fraud escalation opens an escalated case and can suspend
the provider; it is audited.

## 5. Money: reconcile, incidents, disputes

| Task                   | Endpoint                               |
| ---------------------- | -------------------------------------- |
| Reconciliation report  | `POST /api/admin/reconcile`            |
| Open payment incidents | `GET /api/admin/payment-incidents`     |
| Resolve a dispute      | `POST /api/admin/disputes/:id/resolve` |

Reconciliation adjusts **platform** state only (expires stale quotes/payments,
releases reservations). It **never fabricates partner settlement**. Investigate
`payment-incidents` before running it if the cause is unclear (see
[INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)).

## 6. Data protection and retention

| Task                        | Endpoint                                                        |
| --------------------------- | --------------------------------------------------------------- |
| Retention preview (dry run) | `GET /api/admin/retention`, `POST .../retention/run` (`dryRun`) |
| Pending account deletions   | `GET /api/admin/account-deletions`                              |
| Process a deletion          | `POST /api/admin/account-deletions/:id/process`                 |

Retention purges only transient, non-financial records past their window.
Financial ledgers, payments, settlements, receipts, disputes, credits, and audit
events are **never** purged. Account deletion removes personal data but retains
financial and audit records by policy (see [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) §7).

## 7. Runtime controls (kill switches)

Disable a subsystem without a deploy. Changes are audited.

```bash
GET  /api/admin/flags                 # current state
GET  /api/admin/flags/keys            # valid flag keys
PUT  /api/admin/flags/:key            # { "enabled": false, "reason": "incident INC-123" }
```

Flags: `payments`, `ai_extraction`, `partner_modules`. Prefer a flag over a
deploy to contain an incident fast.

## 8. Reporting

`GET /api/admin/metrics` returns counts computed from live tables: bills by
status, validation findings, review cases, payments/funding/settlements by status
and adapter mode, `job_queue` by status, AI-run totals, and recent events. Use it
with [MONITORING.md](./MONITORING.md) to watch reconciliation and job health.

## 9. Routine checklist

- [ ] Review `GET /api/admin/onboarding` daily; action pending provider/org reviews.
- [ ] Watch `GET /api/admin/payment-incidents`; investigate before reconciling.
- [ ] Confirm `job_queue` has no stuck or failed jobs (see [MONITORING.md](./MONITORING.md) §3).
- [ ] Review `GET /api/admin/validation/appeals` and resolve review cases.
- [ ] Confirm the newest backup exists and its date is current.
- [ ] Keep secrets rotated per [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) §3.
