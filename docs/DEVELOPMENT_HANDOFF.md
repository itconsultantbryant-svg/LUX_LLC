# Development handoff — 2026-10-09

Current state (2026-10-11): the API is deployed on Neon Functions and uses Neon PostgreSQL. The local frontend runs at `http://127.0.0.1:5173`. Development migrations and the full account/extraction HTTP flow through the frontend proxy have been verified. See [Neon development](NEON_DEVELOPMENT.md) for the project, branch, and restart details. Earlier audit notes below describe the state before Neon deployment.

## Backlog reconciliation — 2026-10-13

[Implementation backlog](IMPLEMENTATION_BACKLOG.md) statuses were reconciled
against the deployed code (Function deployment 5, migrations through 0006). The
prior backlog understated progress: the ledger/wallet, contribution pots, private
bill storage, customer bill review, deterministic funding engine, payment
intents with idempotency, receipts/audit, provider directory, provider
confirmation, and contributor flows are implemented and are now marked `done`.

The reconciliation also confirmed genuine gaps. Most were subsequently closed (see
the operations continuation and the AI-pipeline section below): bill-workflow AI
extraction is now enqueued from bill intake, and the human review queue, AI
involvement metrics, scheduled reconciliation worker, sponsor program admin, and
standalone fee schedule are implemented. Phase 4 partner work remains blocked on
external credentials.

## Authentication and authorization continuation

The implementation now includes phone-provider configuration, persistent rate and attempt limits, session revocation, MFA, recovery, scoped caregiver permissions, institution invitations, independent onboarding review, and server-enforced record/document access. `/account/security` exposes customer security and onboarding actions. See [Authorization](AUTHORIZATION.md) for the permission matrix, setup, tests, and remaining integration requirements. Older Phase 1 notes below describe the earlier sandbox-only implementation.

## Core model and accounting continuation

The database now has the core care/payment/benefit model and a double-entry ledger with immutable posted journals, exact money, idempotency, source-specific allocation restrictions, and protected account balances. Migration 0004 and the synthetic seed are applied to Neon development. Function deployment 3 serves the authenticated wallet projection, and the home page displays each currency and funding state separately. See [Core data model](CORE_DATA_MODEL.md) and [Neon development](NEON_DEVELOPMENT.md) for validation and restart details.

## Recovered context

The LUX-specific Cursor conversation requested the HealthWallet Liberia product foundation and stopped during dependency setup. The current scope is Phase 0 acceptance: working local apps, database migrations, foundational checks, and a clear backlog. Phase 1 starts with sandbox phone OTP, roles, sessions, and consent.

The workspace contains a React/Vite frontend, Fastify API, shared Zod contracts, PostgreSQL/Drizzle migrations, sandbox adapters, and product documentation. The extraction demo is wired to an API; the complete payment journey is not implemented.

## Environment findings and repairs

- Local Node: 24.19.0; pnpm: 11.3.0; PostgreSQL 15 is listening on port 5432.
- API and web `.env` files exist. Their values were not included in this report.
- No `.git` directory, remote association, or `.devcontainer` configuration exists in this folder. GitHub CLI is not available. No remote GitHub Codespace was inspected.
- Docker CLI is unavailable; local PostgreSQL is the available database option.
- Aligned `.nvmrc`, CI, package engines, and README on Node 24. The installed pnpm package requires Node >=22.13, making the former Node 20 CI setting incompatible.
- Excluded `.pnpm-store` from formatting and future source control; formatted existing scaffold files.
- Added shared-package builds before development, type checking, and tests. The combined development command also watches the shared package.

## Verification and next steps

Lint, TypeScript checks, and all six existing tests passed during the audit. These tests cover shared bill validation, sandbox extraction, funding allocation, and web configuration; they do not establish full payment-workflow correctness.

Database migration execution was blocked by the sandbox's restriction on the tsx IPC socket. The request to run outside the sandbox was declined. Migrations and live HTTP readiness remain unverified, even though PostgreSQL is listening. Existing backlog entries marked done should not be treated as proof of database acceptance.

Run the following from a terminal with local service access:

```bash
nvm use
pnpm check
pnpm db:migrate
pnpm dev
```

Then verify `http://localhost:5173`, `http://localhost:4000/health`, `http://localhost:4000/ready`, and sandbox extraction on the payment journey page. Close the remaining Phase 0 verification before implementing Phase 1. If a separate GitHub Codespace contains newer work, reconcile it with this folder before proceeding.

## Phase 1 continuation — sandbox identity

Implemented an `/account` page and five API endpoints:

- `POST /api/auth/request-code`: validates an international phone number and returns an explicitly simulated code; no SMS is sent.
- `POST /api/auth/verify-code`: requires the code and both current sandbox consent acknowledgments, then creates a session.
- `GET /api/auth/me`: returns the signed-in user's profile, server-assigned roles, and latest consent choices.
- `POST /api/auth/consent`: appends the signed-in user's consent choice and an audit event; read-only partner/system roles cannot write consent.
- `POST /api/auth/logout`: revokes the current session and clears its cookie.

Codes expire after five minutes and permit five attempts. Resending invalidates earlier codes. Requests have a one-minute phone cooldown, a five-per-hour phone limit, and a twenty-per-hour IP limit. PostgreSQL transaction/advisory locks coordinate these limits and single-use verification across API processes. The API uses the direct peer IP, without trusting forwarded headers; a proxy can therefore make clients share the IP limit until trusted-proxy configuration is deliberately added.

Codes are stored as salted scrypt hashes; random session tokens are stored only as SHA-256 hashes. Sessions expire after eight hours. Browser sessions use HTTP-only, SameSite=Strict cookies, with Secure enabled for HTTPS requests/origins. Serve the frontend and API on the same site (the existing Vite proxy works locally). Authentication responses disable caching; untrusted write origins and cross-site requests are rejected. Production cannot use these sandbox authentication routes. A sandbox login does not establish phone ownership and must not protect live funds or real health data.

New users receive only `customer`; public requests cannot choose roles or another user's ID. Existing users retain their assigned roles. This slice does not add an administration interface for assigning roles. Consent text is explicitly for fictional sandbox data (`sandbox-v1`), not approved live-service terms. Downstream wallet/bill features still need their own ownership, role, and consent enforcement.

Migration `0001_identity.sql` adds `otp_challenges` and `auth_sessions`. The original empty `0000_snapshot.json` was reconstructed and checked against `0000_foundation.sql`; the original SQL was not changed. Regression tests detect duplicate table/type creation and incomplete snapshot histories.

Service and HTTP tests use an in-memory test store; runtime always uses PostgreSQL. An opt-in PostgreSQL integration suite (`pnpm --filter @healthwallet/api test:db`) is wired into CI after migration; it requires `APP_ENV=test` and a dedicated database whose name ends in `_test`. It checks concurrent code verification, concurrent requests, persisted failed attempts, and session revocation. This suite has not been run locally. These tests do not verify live PostgreSQL locking, migration execution, or browser behavior. Database migration and browser verification remain pending under the existing execution restriction. Expired challenge/session cleanup is also a later operational task.

To exercise the feature after migrations are allowed:

```bash
pnpm db:migrate
pnpm dev
```

Open `http://localhost:5173/account`, enter a fictional international phone number, copy the displayed simulation code, read and accept both sandbox consent statements, and sign in. Refresh to check session restoration, withdraw a consent, and sign out. Do not enter a real patient's information.

## LUX brand and responsive web app

Applied the supplied LUX AI logo to the shared app shell, home screen, install
instructions, offline notice, favicon, and app icons. Shared navy/orange tokens
replace the previous green/gold palette. Phone navigation sits at the bottom;
layouts adapt for tablet and desktop. Includes safe-area spacing, keyboard focus,
reduced-motion support, and a production-only service worker that caches public
branding/offline assets only. Native store binaries and public HTTPS frontend
hosting are not part of this change.

Validation: production build, lint, typecheck, frontend tests, and offline privacy
checks passed. The backend identity suite passed on rerun with a 20-second timeout
following one five-second timeout under load. Neon readiness returned database=true.
Chrome DevTools responsive checks are provided in
`apps/web/scripts/check-browser.mjs`, but local Chrome navigation timed out before
layout assertions could run; visual device verification remains outstanding.

## Customer and institutional design system

The latest shell uses customer Home, Pay for Care, Get Support, and History
navigation, with Profile under More and separate institutional entry. Customer
home distinguishes LRD available, restricted, and pending funds. Three-step
synthetic payment, savings, and support flows update the in-memory demo wallet and
history. Four institutional previews provide responsive queues and review feedback.
See `docs/DESIGN_SYSTEM.md` for the shared tokens, patterns, and integration limits.

Try Demo is now strictly limited to `VITE_APP_ENV=demo`; it is absent from ordinary
development and production. The explicit local demo runs on port 5174. Its existing
identity/status proxy still uses the Neon development backend; financial and
institutional operations in this UI are synthetic and do not call mutation APIs.

Verification superseding the earlier visual-testing limitation: the actual React
components passed 75 viewport/flow checks at widths 320, 390, 768, 1024, and 1440,
including customer review/confirmation and four institutional layouts. Keyboard
menu closure, confirmation focus, offline retry failure/recovery, and reset passed.
These checks use the self-contained MemoryRouter fixture because local Chrome
HTTP navigation times out. They do not validate backend integration or native
mobile browsers. Production build, lint/typecheck, and 16 frontend tests passed;
Neon readiness returned database=true. Screenshots are in `/tmp/lux-screenshots`.

## Funding workflow continuation

Healthcare funding is now implemented and deployed as Neon development function **4**, with additive migration **0005**. The current workflow and remaining live-provider boundaries are documented in [Funding workflows](FUNDING_WORKFLOWS.md). It includes exact-money quotes, explicit authorization, pending/failed states without ledger inflation, atomic exactly-once confirmed credits, private support links, protected receipts, goal progress and consented editable savings planning. Payment and international transfer activity is simulated; the production path fails closed without a live provider. The storage activation limitation described earlier is unchanged.

## Provider portal continuation — 2026-10-12

Neon deployment 5 and migration 0006 are active. The provider portal supports profiles, staff invitations/access controls, customer association codes, exact itemized billing, revision history, evidence uploads/confirmations, payment status, issued receipts and dispute/correction submissions. Customer Pay for Care supports a verified directory, provider QR scanning/link/photo fallback, bill entry and document capture. Independent authorized reviews govern verification; PostgreSQL blocks live payment creation/capture when verification or current evidence/customer acceptance is missing. See [Provider portal](PROVIDER_PORTAL.md) and the latest [Neon development](NEON_DEVELOPMENT.md) entry for tests and remaining production limits.

## Operations continuation — AI extraction, review, metrics, programs, reconciliation (2026-10-13)

The remaining implementable backlog slices landed and are marked `done` in
[IMPLEMENTATION_BACKLOG.md](IMPLEMENTATION_BACKLOG.md). All behavior stays on sandbox
adapters, fails closed without them, and never fabricates settlement or accuracy.

- **P1-06 extraction runtime** — `apps/api/src/modules/extraction/service.ts`:
  `evaluateExtraction` (deterministic coherence checks against the `0.75` review
  threshold), `recordExtraction` (writes `ai_runs`, artifacts, evidence, findings),
  `enqueueExtraction` (advisory-locked job write), `processExtractionJobs`
  (SAVEPOINT-protected job executor that reads the document bytes through the
  private storage adapter). Route: `POST /api/bills/:id/extract` (400 fail-closed
  without a document). Note the Postgres pitfall: mixing `$n::uuid` casts with
  uncast `$n` in one statement unifies the parameter type, so compare as
  `payload->>'documentId' = $2::text`.
- **P2-05 review queue + P2-06/M-01/M-02 metrics** — `GET /api/admin/reviews`,
  `POST /api/admin/reviews/:id/:decision`, `GET /api/admin/metrics`
  (`apps/api/src/modules/operations/reports.ts`), all under MFA-verified platform
  sessions. Shared journey taxonomy in `packages/shared/src/journey.ts`.
- **P2-03 reconciliation** — `POST /api/admin/reconcile`
  (`apps/api/src/modules/operations/reconciliation.ts`): expires stale quotes and
  stale pending payments, releases expired reservations, records job+audit; no
  fabricated settlement.
- **P3-04 sponsor programs** — CRUD + `POST /api/programs/:id/vouchers`
  (`apps/api/src/modules/programs/service.ts`): `issueVoucher` runs inside
  `ledger.operation` and creates allocation + bucket accounts + journal +
  `partner_settlements(expected)` + voucher, returning a one-time vault code.
- **P3-05 fee disclosure** — public `GET /api/fees` over the all-zero
  `sandbox-fees-v1` schedule (`packages/shared/src/fees.ts`), plus the
  `FeeDisclosure` component in the funding save flow; reviewer/operator web screens
  at `/institutional/reviews` and `/institutional/metrics`.
- **Integration suite** — `apps/api/src/modules/operations/operations.integration.test.ts`
  (10 scenarios: readable extraction, unreadable→assistance, corrections+payment
  gate, fail-closed, MFA gate, review decision, program voucher
  +2500, metrics, reconciliation). Run locally with
  `node apps/api/scripts/run-operations-tests.mjs` (isolated `healthwallet_test`
  schema, `OPERATIONS_DATABASE_TESTS=1`). The suite is wired into CI alongside the
  other DB suites.
- **P4-04 perf smoke** — `apps/api/src/perf/perf.smoke.test.ts` +
  `apps/api/scripts/run-perf-smoke.mjs`: read-path latency/payload smoke against an
  isolated schema (payload `< 64 KB` is the binding 3G budget; latency budget is
  generous because the suite runs against remote Neon).
- **P4-05 secret scanning** — CI adds `gitleaks/gitleaks-action` plus a hygiene check
  for committed token values.
- **P4-06 demo script** — [DEMO_SCRIPT.md](DEMO_SCRIPT.md) covers the customer +
  reviewer console walkthrough and the mandatory sandbox honesty caveats.

Remaining non-blocked work: the scheduled (cron-triggered) reconciliation worker is
now provided as `apps/api/src/workers/reconcile.ts` (`pnpm reconcile`), pending only
production scheduler wiring; the journey-to-`paid`/receipt terminals remain covered
across the operations, funding, and provider suites. Blocked items are unchanged:
Orange Money adapter access, gateway approval for messaging/USSD, live AI eval
definition, and S3 storage activation on the deployed function.

## LUX HealthTrust AI pipeline — real extraction, review, corrections (2026-10-15)

The first working LUX HealthTrust pipeline replaced the fixture-only sandbox
extractor with a deterministic reader that actually reads the uploaded document,
and never invents values.

- **Reader** — `apps/api/src/modules/extraction/parse.ts` turns bytes into
  page-ordered text and an explicit `unreadable` reason: `text/plain` (UTF-8,
  binary-sniffed), FlateDecode PDF content streams (`(...)Tj` / `[...]TJ`),
  images without OCR and unknown types are `unreadable`. `heuristic.ts` extracts
  provider, customer, bill reference, date, currency, total, and line items with
  per-field evidence (page, quote, `textSpan`), flags ambiguous/multiple totals,
  flags unsupported currencies, and records instruction-like text as `untrusted`
  evidence. `SandboxAiAdapter` (`ai.sandbox.ts`, id `reader:rules-v1`) wires these
  together; `AiAdapter.extractFromDocument` now receives `bytes`.
- **No fabrication** — unreadable documents yield an empty, `unreadable: true`
  result and finding `UNREADABLE_DOCUMENT`; the bill routes to `needs_review` and
  a review case (`assistance`). `CURRENCY_UNSUPPORTED`, `AMBIGUOUS_FIELD`, and
  `UNTRUSTED_DOCUMENT_INSTRUCTION` findings are added on top of the coherence
  checks. In-document instructions are recorded but never acted on.
- **Customer review + corrections** — `GET /api/care/bills/:id/extraction` and
  `POST /api/care/bills/:id/extraction-review` (migration
  `0007_ambitious_onslaught`: `extraction_corrections` append-only table +
  `bills.extraction_reviewed_at/by`). Corrections preserve original and corrected
  values. `BillWorkspace.tsx` shows the review panel for customers.
- **Payment gate** — `POST /api/care/bills/:id/payment-request` returns `409`
  when the latest `ai_runs.requires_review` is true and the customer has not
  reviewed the extraction (AC-05).
- **Upload validation** — `POST /api/bills/:id/documents` now rejects bytes that
  do not match the declared content type (`%PDF`, PNG, JPEG signatures; no NUL
  bytes for text), in addition to the existing size/revision checks.
- **Tests** — `parse.test.ts` and `heuristic.test.ts` (unit) plus the extended
  operations integration suite. Run `node apps/api/scripts/run-operations-tests.mjs`.

## Hybrid validation — rules + AI + external records (2026-10-15)

A bill is now checked by a hybrid validation engine before it can be paid. The
result is a set of structured findings, an automated route, and a customer-facing
status. Validation is deliberately **separate from financial authorization**: a
passing check is not a payment guarantee.

- **Contract** — `packages/shared/src/validation.ts`: 12 check names, check
  results (`pass`/`info`/`warn`/`fail`/`uncertain`/`unavailable`/`not_applicable`),
  severities, sources (`deterministic`/`ai`/`external`), 5 routes, and 8
  customer statuses with labels. `decideRoute`, `overallResult`, and
  `deriveCustomerStatus` are pure and unit-tested (`validation.test.ts`).
- **Policy** — `ValidationPolicy` (`lux-validation-v1`) with
  `autoAcceptMaxMinor=500000`, `reviewerAuthorityMinor=250000`,
  `nearDuplicateWindowDays=45`, `nearDuplicateToleranceBps=200`,
  `nearDuplicateReferenceSimilarity=0.85`, and per-check routing. `decline`
  outranks `await_review` > `await_provider` > `needs_correction` >
  `auto_accept`; any high-risk, conflicting, or uncertain finding prevents
  auto-accept. The approved policy is seeded and mirrored as a built-in fallback.
- **Engine** — `apps/api/src/modules/validation/checks.ts` evaluates each check
  over a loaded context (`context.ts`); `engine.ts` persists the run and
  findings, sets `bills.validation_state`, and opens a `review_cases` row on
  `await_review`. Price/insurance checks report `unavailable` when no reference
  dataset or policy exists (never fabricated). `reviewerAuthorityMinor` caps the
  amount a reviewer may approve alone (above it → `409`).
- **Reviewer capabilities** — `review.ts` records append-only actions
  (`request_clarification`, `correct_finding`, `approve`, `decline`, `escalate`,
  `appeal`, `resolve`) with reasons, before/after, and authority. Routes in
  `routes/validation.ts`; appeals surface at `GET /api/admin/validation/appeals`.
- **Payment gate** — `POST /api/provider/bills/:id/payment-request` returns `409`
  unless the latest run is `auto_accept` or a reviewer `approve` followed the run.
- **Schema** — migration `0008_calm_rick_jones` adds `validation_policies`,
  `validation_runs`, `validation_results`, `validation_reviewer_actions`,
  `bill_appeals`, `bills.validation_state`, append-only triggers, and the seeded
  approved policy.
- **Tests** — `node apps/api/scripts/run-validation-tests.mjs` (`pnpm
test:validation`): valid → `auto_accept`/`ready_for_payment`; exact duplicate →
  `await_review` and blocked payment; uncertain document → review without
  fabricated values; reviewer clarifications/corrections/escalations/appeals.
  Migration `0008` is applied to `healthwallet_dev`.

## Funding assistance — deterministic eligibility and actions (2026-10-15)

A validated bill now shows exactly how it can be funded. Every figure is produced
by a deterministic engine from authorized ledger and coverage records; nothing is
inferred and nothing is promised that the ledger would refuse.

- **Contract** — `packages/shared/src/assistance.ts`: funding source kinds/labels,
  `ASSISTANCE_PLAN_VERSION`, `AssistanceSourceSchema` (eligibility + block reason),
  `AllocationBlockReasonSchema`, `AssistanceActionSchema` (use funds, apply
  voucher, request support, explore financing, request help),
  `InsuranceCoverageSchema`, `FundingPlanSchema`, and `AssistanceExplanationSchema`
  (for a later grounded assistant). Re-exported from `@healthwallet/shared`.
- **Engine** — `apps/api/src/modules/assistance/engine.ts` reuses
  `loadValidationContext` so a plan sees the same allocations/coverage the
  validator does. `classifyAllocation` mirrors the ledger's `eligible` checks
  (status, window, program status/rule version, category/provider restrictions,
  free-form rules) and blocks anything that would fail at reserve time. Insurance
  is only reported when a verified dataset exists — never inferred from uploaded
  documents. Plan math: `allocatedMinor` = active/captured reservations;
  `shortfallMinor` = bill − reservations − eligible funds; per-source breakdown
  and action availability (including partner financing offers).
- **Service** — `apps/api/src/modules/assistance/service.ts` operates inside the
  authenticated session transaction. `applyFunds` ensures a payable intent via the
  shared `ensurePayableIntent` gate (`providers/service.ts`, factored out of the
  payment-request route) then reserves each eligible allocation through the ledger
  (`LedgerService.reserveWithin`, a new client-scoped variant of `reserve`) up to
  the intent amount. `applyVoucher` reserves the voucher then marks it redeemed.
  `requestSupport`/explore-financing record non-money requests. All money actions
  are idempotent via `financial_operations`.
- **Routes** — `apps/api/src/routes/assistance.ts`: `GET /api/bills/:id/assistance`,
  `POST .../assistance/apply`, `.../assistance/voucher`, `.../assistance/support`,
  `.../assistance/financing`, registered in `app.ts`.
- **Web** — `apps/web/src/components/BillWorkspace.tsx` adds a Funding panel:
  simulation label, eligible/held/shortfall summary, per-source eligibility with
  block reasons, reserve-eligible-funds and apply-voucher buttons, a shortfall
  support/help request, insurance honesty note, and open support/financing records.
- **Schema** — migration `0009_slim_morgan_stark` adds `bill_funding_plans`
  (snapshots), `support_requests`, and `financing_inquiries`; applied to
  `healthwallet_dev`.
- **Tests** — `node apps/api/scripts/run-assistance-tests.mjs` (`pnpm
test:assistance`): deterministic plan with a category-restricted source flagged;
  reserve-up-to-shortfall with ledger balances asserted and idempotent replay;
  voucher applied once then refused; shortfall support (deduped), help and partner
  financing inquiry; cross-customer denial and honest "no funds moved" path. 5/5
  pass. `pnpm check` remains green.

## Runtime fix — proxy trailing slash (2026-10-15)

The web proxy was building `//health` (double-slash) URLs because
`NEON_FUNCTION_URL` ended with `/`; every proxied request returned
`404 Route GET://... not found`. Fixed defensively in three places:

- `apps/web/vite.config.ts` strips trailing slashes from the proxy target.
- `apps/api/src/neon-handler.ts` collapses duplicate leading slashes before
  injecting into Fastify (regression test added).
- `.env.local` `NEON_FUNCTION_URL` no longer ends with `/`.

Verified end-to-end through the Vite proxy: `/health` and `/ready` return 200 and
`/api/meta` returns product metadata. The home dashboard was also redesigned with a
shared `Icon` component and dashboard cards (icons on nav, cards, stat rows, and
institutional metrics). The deployed function predates a few routes (e.g. public
`/api/fees`) and should be redeployed from current source when convenient.
