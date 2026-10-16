# Security Hardening

Product: **HealthWallet Liberia** · AI: **LUX HealthTrust**

This document records the application-wide security review and the controls that
back it. It is the reference for the acceptance criteria "critical authorization,
financial integrity, document privacy, and recovery scenarios pass verification
before production use."

Everything here is **fail closed**: when a prerequisite is missing (secret,
storage adapter, verification evidence) the operation is refused rather than
degraded.

---

## 1. Authorization and isolation

- Session-based access is resolved in `apps/api/src/modules/security/access.ts`
  (`withSession` / `Access`). Every request opens a transaction and takes
  `FOR SHARE` locks on the session and user, so revocation and suspension take
  effect immediately.
- Object-level access is re-checked per record:
  - `Access.bill(id, scope)` grants customers only for their own bills (or a
    dependent's bill with matching care authorization) and provider/partner
    members only within an **approved** organization.
  - `Access.organization(id, roles)` requires an active membership in an
    **approved** organization; `Access.platform()` requires `platform_admin` plus
    fresh MFA.
- Caregiver access is limited to exact subjects, explicit scopes
  (`records:*`, `documents:*`), and is denied after expiry or revocation.
- Partner reward rules are only listed while the owning organization is
  `approved`; USSD sessions are bound to the owning actor's phone.
- Database isolation is currently application-layer only. Row-level security is
  **not** implemented; see the open item in section 8.

## 2. Document privacy

- Documents are stored through the private storage adapter. `storage.s3.ts`
  deliberately throws on `getSignedReadUrl`, so direct/signed object URLs cannot
  be handed out.
- Downloads stream through `GET /api/documents/:id/download` after an
  object-level `documents:read` check, with `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff`, and a restrictive CSP.
- **Expiring, actor-bound links** (`modules/security/download-tokens.ts`):
  `POST /api/documents/:id/download-link` mints an HMAC-SHA256 token bound to the
  document **and** the requesting actor, expiring after
  `DOWNLOAD_LINK_TTL_SECONDS` (default 120). A leaked link is useless to a
  different account and expires. `?token=` is verified before streaming.
- Purged documents return `410 Gone`.
- Uploads validate that the real bytes match the declared content type and cap
  size.

## 3. Secrets management

- `loadEnv` (`apps/api/src/config/env.ts`) validates configuration at boot and
  **fails closed in production** unless:
  - `PAYMENT_CALLBACK_SECRET` is set (verifies provider callbacks), and
  - `DOWNLOAD_LINK_SECRET` **or** `SECURITY_ENCRYPTION_KEY` is set (signs
    document links), and
  - `PAYMENT_ADAPTER=live` only when partner credentials are present.
- `scripts/check-production.mjs` is the offline preflight for a deployment
  `.env`; it never prints secret values.
- Secrets are never logged. No secret ever reaches the AI model.

## 4. Payment and financial integrity

- Callbacks are signature-verified over the raw body and sequenced
  monotonically; a browser redirect never produces success.
- An open dispute blocks payment at the database level.
- Reconciliation adjusts only platform state; partner settlement is never
  fabricated.
- Audit events are append-only, enforced by a database trigger
  (`audit_events_append_only`, migration `0012`).

## 5. Runtime kill switches

`modules/security/flags.ts` stores runtime switches in `system_flags`. Absence of
a row means enabled (fail open on read); every change is audited and requires a
platform admin with fresh MFA.

| Flag              | Disables                                                |
| ----------------- | ------------------------------------------------------- |
| `payments`        | payment initiate / authorize / refund                   |
| `ai_extraction`   | sandbox AI extraction endpoints                         |
| `partner_modules` | Health Credit, Insurance, Rewards, USSD partner modules |

## 6. Rate limiting

- Global per-IP limit on mutating `/api/*` calls (`RATE_LIMIT_MUTATIONS` per
  `RATE_LIMIT_WINDOW_SECONDS`), exempting sign-in and the signed provider
  callback.
- Per-route limits on authentication, MFA, recovery, and other sensitive
  endpoints via `modules/security/limits.ts`.

## 7. Account export, deletion, and retention

- `GET /api/account/export` returns **only the caller's** records and never
  includes document bytes, session hashes, tokens, codes, or credentials.
- `POST /api/account/deletion` opens a request; a platform admin (fresh MFA)
  processes it. Processing revokes sessions, removes MFA/recovery secrets,
  revokes care authorizations, and anonymizes the identity. Financial, consent,
  and audit records are **retained**.
- `modules/operations/retention.ts` (`worker:retention`) purges only transient
  records past their window and, optionally, document bytes. Ledger,
  payments, settlements, receipts, disputes, credits, and audit events are never
  purged.

## 8. AI data handling

- AI only **explains** deterministic results; it never invents settlement,
  accuracy, or coverage. Coverage is never inferred from uploaded documents.
- The assistant is permission-scoped over read tools and is never given payment
  credentials. Consequential actions require an explicit user confirmation
  (`assistant_confirmations`).
- Extraction artifacts are transient: stale `ai_artifacts` are eligible for
  retention purge once no open review case or unresolved finding references the
  bill.
- Outputs are schema-validated and labeled when running in sandbox mode.

## 9. Recovery

- `scripts/backup-db.mjs` produces a custom-format `pg_dump`.
- `scripts/restore-db.mjs` refuses to run without `RESTORE_CONFIRM=yes`, refuses
  a hosted (`.neon.tech`) target unless `RESTORE_ALLOW_REMOTE=yes`, and prefers a
  `*_restore` database.
- Procedures, incident runbooks, and provider callback replay steps live in
  `docs/OPERATIONS_RUNBOOK.md`.

---

## Acceptance criteria — security & recovery

Automated checks run in `apps/api/src/modules/security/security.integration.test.ts`
(`pnpm test:security`).

- **AC-SEC-01 (authorization)** — Given another customer's bill or document,
  When an unauthenticated or different actor requests read/write/download, Then
  the response is `401`/`404` and no data or storage key is returned.
- **AC-SEC-02 (document privacy)** — Given a private document, When a link is
  minted, Then it expires and is bound to the requesting actor; a leaked or
  tampered link is refused, and a purged document returns `410`.
- **AC-SEC-03 (financial integrity)** — Given an open dispute or a disabled
  `payments` flag, When payment is attempted, Then it does not proceed; audit
  events cannot be updated or deleted.
- **AC-SEC-04 (kill switches)** — Given a platform admin with fresh MFA, When a
  flag is disabled, Then the corresponding operations fail closed (`503`) and
  non-admins cannot change flags.
- **AC-SEC-05 (data subject)** — Given a customer, When they export, Then only
  their own records return and no secrets are included; When deletion is
  processed, Then sessions are revoked, identity is anonymized, and financial
  records are retained.
- **AC-SEC-06 (recovery)** — Given a backup dump, When restored into a
  `*_restore` database with `RESTORE_CONFIRM=yes`, Then the schema and data match
  the source.

---

## Open items

- Row-level security (RLS) is not yet enabled; isolation is application-layer
  only. Tracked for a future migration.
- Live adapter readiness remains gated on partner credentials (P4-01/02/03).
