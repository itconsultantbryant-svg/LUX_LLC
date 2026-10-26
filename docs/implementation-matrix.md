# HealthWallet Liberia upgrade audit

**Product:** HealthWallet Liberia · Powered by LUX HealthTrust · Operated by LUX AI
**Reference set:** `implementation_images/` (25 October 2026)
**Status:** Phase 1 complete; Phase 2–20 backlog below.

## Repository audit

| Area | Current implementation | Upgrade direction |
|---|---|---|
| Web | React 19, React Router, Vite (`apps/web`) | Retain; replace placeholder portal pages with reusable reference components backed by APIs. |
| API | Fastify (`apps/api`) | Retain route modules and `withSession` server authorization. |
| Database | PostgreSQL/Neon-compatible, Drizzle migrations | Additive migrations only; no destructive schema operations. |
| Identity | HTTP-only sessions, phone OTP, MFA enrollment, development credential login | Keep role assignment server-side; complete credential/MFA flow before production use. |
| Ledger/wallet | Ledger, funding, payments, receipts and exact minor-unit money modules | Use existing atomic/idempotent services; do not replace with client-side balances. |
| AI | Extraction, validation, assistance and heuristic modules/routes | Surface persisted findings/evidence; never substitute static AI results. |
| Partners | Sandbox payment, messaging, storage adapters; USSD/insurance partner routes | Keep sandbox/live separation server-side. |
| Storage | Local/S3 adapter abstraction | Preserve document storage and bill evidence references. |
| Jobs | Reconciliation and retention workers | Retain; add only deployment-compatible polling/worker work. |
| Deployment | Vite/Vercel-compatible web; Neon-compatible API adapter | Keep existing strategy and environment boundaries. |

## Current route and permission findings

- Existing customer routes: `/dashboard`, `/save`, `/pay`, `/support`, `/history`, `/services/:section`, `/account`.
- Existing institutional/API capabilities include provider onboarding/bills, funding, payment callback handling, operations/review, validation, governance, receipts, notifications, security and partner modules.
- Current role codes are `customer`, provider roles, `employer_admin`, `sponsor_admin`, `partner_officer`, `reviewer`, and `platform_admin`.
- The current visual institutional renderer is a transition surface, not an adequate replacement for the persisted workflows. It must be replaced screen-by-screen using the existing modules.
- API access is enforced by `withSession`; menu visibility alone is not considered authorization.

## Reference-to-implementation matrix

| Screenshot | Portal / screen | Existing equivalent | Reuse | Required upgrade / verification |
|---|---|---|---|---|
| 10.42.51 | Customer dashboard | `CustomerHome`, wallet APIs | ledger, funding, partner coverage | Load authenticated LRD/USD balances, verified insurance and scoped activity; no fixture values outside demo. |
| 10.43.05 | Save for Health | `FundingPage` | funding service, payment adapter | Source ownership, estimate vs confirmed balance, idempotent deposit state. |
| 10.44.13 | Pay Provider | `CarePage`, bill workflow | providers, extraction, validation, payments | Verified provider search, bill evidence/review, server confirmation. |
| 10.44.23 | Receive Funds | contribution/funding routes | wallet identifiers, QR component | Safe beneficiary QR/reference and approved-source policy. |
| 10.44.52 | Claims | partner insurance routes | claims/coverage adapter | Separate LUX review, insurer decision and payment outcome. |
| 10.47.07 | Transactions | `HistoryPage`, receipts | ledger/receipts | Scoped search/filter/export/detail/pagination. |
| 10.47.18 | USSD | partner USSD route | USSD service | Simulator uses the same authorized service and remains labelled sandbox. |
| 10.47.24 | Orange Money | funding/payment adapters | sandbox adapter | Authorized demo controls; callback idempotency/reversal cases. |
| 10.47.34 | Profile | `AccountPage`, `SecurityPage` | identity/security | Verified-phone and linked-account boundaries. |
| 10.48.36–58 | Employer dashboard/employees/contribute/history | funding + organization access | organizations, contributions, receipts | Employer-scoped allocations only; no personal wallet/medical disclosure. |
| 10.50.02–23 | Provider dashboard/verify/payments/claims/payouts/profile | `ProviderPage` and provider APIs | provider profiles, bills, validation | Restore real provider page sections, controlled lookup, payout locking. |
| 10.51.04–23 | Bank dashboard/funding/reconcile/history | funding + reconciliation worker | funding lifecycle, ledger | Persist pending→verified→credited→reconciled with evidence and idempotency. |
| 10.52.02–35 | Sponsor dashboard/programs/beneficiaries/history/create | governance/program routes | program and allocation services | Separate program lifecycle from utilization; enforce budget/restrictions. |
| 10.53.30–10.54.11 | LUX overview/review/verification/risk/validation/claims/transactions/audit | operations, validation, admin routes | audit, review, extraction | Compute metrics from data; evidence-led review and read-only audit/export. |

## Prioritized backlog

1. **Restore functional data pages:** replace transition renderer with role-scoped API-backed dashboard, provider, funding, program and operations screens.
2. **Route groups:** introduce `/customer/*`, `/employer/*`, `/provider/*`, `/bank/*`, `/sponsor/*`, `/admin/*` while redirecting old URLs.
3. **Shared components:** shell, role sidebar, back action, cards, badges, filters, table, timeline, dialog, empty/loading/error states.
4. **Financial workflows:** test existing sandbox funding/payment lifecycle before adding any new state; implement missing bank/program/payout transitions additively.
5. **Authorization:** route/API integration tests for every cross-role and cross-organization boundary.
6. **AI/evidence:** expose existing extraction/validation evidence instead of static scores or summary cards.
7. **Responsive/visual verification:** run a browser matrix when Chromium is available; validate desktop/tablet/mobile against all 36 references.

## Verification baseline

- Web unit tests: 33 passing.
- API tests: 96 passing; database-backed integration suites remain opt-in by repository configuration.
- Web and API production builds pass.
- Local sandbox API readiness returns database-ready.
- Provider credential-login verification: the seeded provider administrator resolves only to the synthetic approved Redemption Hospital membership and its verified profile through `/api/provider/portal`.
- Sponsor credential-login verification: the seeded sponsor administrator resolves to the synthetic Community Sponsor organization and its scoped active program through `/api/governance/programs`. Its organization membership uses `organization_admin`, the valid organization-scoped permission; `sponsor_admin` remains the user-level portal role.
- Bank credential-login verification: the seeded bank officer can read only the synthetic Payment Partner settlement through `/api/partners/settlements`; its persisted `expected` status remains visibly unconfirmed.
- Bank authorization verification: an authenticated bank officer receives `200` for its scoped settlement endpoint; an authenticated customer receives `403` for the same endpoint.
- LUX Human Review now uses the existing `/api/admin/reviews` and decision endpoints rather than the transitional reference workspace. Decisions remain server-authorized, audited, and update the associated bill/findings.
- Credential-session verification: Customer, Employer, Provider, Bank, Sponsor, and LUX demo credentials have each issued an HTTP-only session and returned `200` from their role-scoped endpoint. The live check respects the credential rate limit; repeated checks return `429` until its window expires.
- Canonical aliases now cover implemented Customer, Provider, Sponsor, Bank, and LUX screens (for example `/customer/dashboard`, `/sponsor/programs`, `/bank/reconcile`, and `/admin/reviews`) while legacy paths remain available.

## Known limitations before Phase 2 implementation

- Credential login is development-only for seeded accounts; production credential sessions now route to `/login/mfa`, which uses the existing encrypted TOTP enrollment and verification endpoints before institutional actions become available. Sandbox credential sessions remain explicitly MFA-verified only outside production.
- The currently introduced screenshot-style institutional pages are not connected to all persisted workflows and must not be treated as complete financial operations.
- Browser visual automation cannot run in this environment because no Chrome/Chromium binary is available.

## Local migration repair

- Migration `0018_system_flags_repair.sql` repairs development databases where the historic hardening migration was recorded but `system_flags` was absent. It is additive and idempotent.
- After applying it locally, the LUX Admin overview changed from `503` to `200` for the authorized LUX administrator.

## Employer foundation (in progress)

- Migration `0017_employer_directory.sql` adds the `employer` organization kind, the `employer_admin` organization membership role, and an `employer_employees` directory table.
- The directory has organization-scoped uniqueness for both the customer relationship and an employer reference, plus an active/inactive/invited lifecycle.
- `/api/employer/portal` requires recent MFA and an active authorized employer membership, returning only the roster reference, department, lifecycle, display name, and masked phone suffix.
- The seeded employer administrator resolves to synthetic HealthWorks Liberia and its synthetic employee; no wallet balance or medical information is returned.
- Employer authorization verification: the seeded employer administrator receives `200` from `/api/employer/portal`; an authenticated customer receives `403`.
- It intentionally does **not** add a contribution action yet: employee contributions require a dedicated idempotent, atomic ledger state machine and employer funding-source model before money-moving UI is exposed.

## Provider portal view split

- The existing API-backed Provider page now recognizes its navigation view: dashboard, payment requests, profile, and patient-authorization verification.
- Patient verification deliberately requires the existing customer-generated one-use provider association code; no name-only lookup or balance disclosure was introduced.
