# Customer support guide

For the team helping **customers and caregivers**, **contributors**, and
**dependents** use HealthWallet Liberia. Support works through the customer's own
self-service and **escalates any privileged action to a platform administrator**
(there is no separate support role; see
[ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md)).

Golden rules:

- Never ask for, read aloud, or paste a one-time code, password, recovery code,
  or session token. Support never needs them.
- Never bypass MFA or a review decision. Escalate instead.
- Guide the person to the check themselves; do not act as them. Administrator
  impersonation is time-boxed and audited and is discouraged in demo.
- Confirm before sharing any personal or financial detail.

## 1. "I can't sign in"

1. The person signs in with a phone code:
   `POST /api/auth/request-code` then `POST /api/auth/verify-code`.
2. If they have an authenticator, they complete `POST /api/security/mfa/verify`.
3. Codes expire quickly and are single-use. Have them request a fresh code and
   enter it immediately.
4. If they lost their phone or authenticator, use recovery:
   `POST /api/security/recover` (and `POST /api/security/recovery-codes` if they
   have saved recovery codes). If recovery fails, **escalate to a platform
   administrator** — do not attempt to reset credentials yourself.

## 2. "I'm worried someone has access to my account"

1. Have them review and revoke sessions: `GET /api/security/session` and
   `POST /api/security/sessions/revoke`.
2. Have them re-enroll the authenticator (`POST /api/security/mfa/enroll`) and
   regenerate recovery codes (`POST /api/security/recovery-codes`).
3. Escalate to a platform administrator for a suspected compromise; the
   administrator can suspend access and review the audit trail.

## 3. "Where is my bill / payment?"

- Wallet and history: `GET /api/wallet`, `GET /api/bills`, `GET /api/bills/:id`.
- Payment status: `GET /api/payments/:id/status`.
- If a payment is stuck: check whether it is pending authorization. The customer
  authorizes with `POST /api/payments/:id/authorize`. If it is genuinely stuck
  after that, **escalate** — a platform administrator investigates
  `payment-incidents` and runs reconciliation. Support must not promise a
  settlement or a refund.

## 4. "The bill is wrong"

- Details before confirmation: the provider uses corrections. If the customer
  disagrees with a confirmed bill, they raise a dispute:
  `POST /api/care/bills/:id/disputes` (provider/care path) or ask the provider.
- A rejected or short payment is a dispute: escalate to a platform administrator
  to resolve (`POST /api/admin/disputes/:id/resolve`).

## 5. Refunds

Refunds follow policy and are authorized by an administrator/reviewer, not
support. The customer raises a request; escalate it. See
[ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md) §2.4.

## 6. Documents and privacy

- The customer opens their own documents. Download links are short-lived and
  actor-bound: if a link has expired, they request a fresh one
  (`GET /api/documents/:id/download-link`). Never forward a document or download
  link to a third party.
- To see or delete their data:
  - Export: `GET /api/account/export`.
  - Deletion: `POST /api/account/deletion` (cancel with
    `POST /api/account/deletion/cancel`). An operator processes it.
  - Explain that financial and audit records are retained by policy even after
    deletion (see [SECURITY_HARDENING.md](./SECURITY_HARDENING.md) §7).

## 7. Family and dependents

- Family/diaspora contributors fund another person's healthcare pot; they manage
  their own contributions (`/api/funding/*`, `/api/contributions`).
- Caregivers manage dependent access with `/api/dependents`. Explain that access
  is scoped and auditable.

## 8. "I think I've been defrauded"

Escalate immediately as SEV-1 or SEV-2 (see
[INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)). Record: what happened, the bill
or payment identifier, and the time. Do not confront the provider yourself.

## 9. What support must never do

- Never request or handle a one-time code, password, or recovery code.
- Never bypass MFA, human review, or a dispute decision.
- Never promise a payment, settlement, refund, or recovery of funds.
- Never share one person's data with another, even a family member, without the
  scoped consent that `/api/dependents` provides.

## 10. Escalation

Route to a platform administrator for anything privileged: credential recovery,
account suspension, refunds, disputes, and suspected fraud. Use the contact list
in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) §6.
