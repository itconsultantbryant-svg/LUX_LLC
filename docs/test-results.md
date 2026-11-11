# Verification results

## Current release — 11 November 2026

- `pnpm test`: **39 domain/PostgreSQL tests passed** (60.27 seconds), including new demo confirmation expiry/attempt/idempotency checks and safe team contact links.
- `pnpm typecheck`: **passed** for backend, scripts, tests and Next.js after the current enhancements.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation and route generation. Vercel's production build/deployment also succeeded.
- Local browser coverage: **all 9 tests passed across the final public (7) and authenticated (2) runs**. An initial suite run timed out; the next complete run exposed a genuine draft-restoration race. “Start a fresh draft” now waits for draft hydration. Its claim-submission regression and the workspace responsive test passed after the fix; the multi-route workspace test receives a realistic execution budget on this host.
- **Hosted public browser suite: 7/7 passed** at `https://luxllc.vercel.app` (3.8 minutes): real-photo attribution/loaded images/reduced motion, team keyboard modal/focus return, all public routes, supplied team fidelity, responsive navigation/overflow, enquiry persistence and axe checks.
- **Hosted synthetic API/auth/payment workflow: passed**, 11 November 2026 at 10:02 UTC. Five uniquely credentialed actors signed in through the Vercel same-origin proxy; verified anonymous/signup denials, tenant denial, coverage/encounter creation, immutable claim submission, durable validation, human insurer approval, independent maker/checker, mandatory four-digit demo confirmation, idempotent execution, simulated settlement, scoped reports/reconciliation/PDF and unauthenticated-worker denial. No actual funds or real patient data were used.
- New isolated Neon project `lux-healthpay-demo` (`blue-morning-83165791`), PostgreSQL 18, migrations **001–005** applied and synthetic seed successful. The legacy database was not migrated or reset.
- Neon shared `luxapi` and `luxworker` bundles deployed successfully. Every-minute trigger is enabled; provider logs show **`scheduled:true`** durable-job batches. This verifies actual scheduled invocations, not just trigger creation.
- Real-photography build: six responsive sets replaced, three documented Liberian originals, SHA-256 provenance and public license/source credits. Supplied team portraits/LUX artwork are unchanged. See `docs/photography.md`.
- `pnpm audit --prod`: **no known vulnerabilities found**. `git diff --check`: passed before release staging.
- Private credentials/secrets are excluded by `.gitignore` and `.vercelignore`; eight unique demo account passwords are handed off under ignored `.local/` files, not in source.

Post-push verification is recorded in the release handoff once the pushed deployment has been checked. Historical results below are retained as an execution record, not current release limitations.

## Completed initial pass — 10 November 2026

- `pnpm db:migrate`: new isolated local PostgreSQL database, migrations 001–004 applied successfully.
- `pnpm db:seed`: 1 LUX organization, 2 insurers, 3 facilities, 8 real demo-auth accounts, synthetic clinical/claim/payment examples and authoritative team records.
- `pnpm test`: **25 tests passed** in the initial domain/PostgreSQL pass (55.14 seconds). Includes exact fees/rounding, state rules, scoped database access, finance redaction, actual concurrent reservations, payload replay conflicts, maker/checker, timeout, delayed results, fee uniqueness/reversal, immutable evidence and public enquiry nonactivation.
- `pnpm typecheck`: initial root/backend and Next.js checks passed.
- Direct HTTP check: real password sign-in returned 200 and a session cookie; `/me` returned an active membership; scoped `/claims` returned 12 authorized synthetic records.
- First browser pass: **3 passed, 3 failed**. Public-route reachability, team fidelity and automated WCAG-tagged axe checks on Home/Get Started/Team passed. Mobile navigation exposed an early hydration-click issue; login test exposed a password help-text/accessible-name mismatch. Enquiry navigation failed during a development-server configuration restart. These were fixed and the final built-app rerun passed below.
- Playwright’s current Chromium installer does not support this host’s macOS 12. An existing local Chromium was used via `BROWSER_EXECUTABLE`. This is not equivalent to a current multi-browser compatibility matrix.

## Historical baseline verification

- Final `pnpm test`: **36 tests passed** (11.43 seconds). Includes real Better Auth TOTP enrollment/challenge, expired invitation, immediate revoked-membership denial, worker organization scope, attachment scope, mandatory human review on AI timeout, document-instruction isolation, currency/date-filtered operational reports, scoped exports, safe claim withdrawal and undispatched payment cancellation.
- `pnpm build`: **passed**. Optimized Next.js compilation, TypeScript, route generation and page optimization completed successfully.
- Isolated logical backup/restore drill: **passed** into a new empty database. Verified restored counts: 6 organizations, 15 claims, 13 immutable claim versions, 3 ledger entries and 18 audit events. No worker was started against the restored database. A previous target was safely refused because it already contained data.
- Final `pnpm typecheck`: **passed**, including backend, scripts, tests and Next.js.
- Final built-app `pnpm test:browser`: **7 tests passed** (1.6 minutes). Verified all public routes, authoritative team content, mobile menu focus/Escape, enquiry recording, axe checks on public pages and the claims workspace, a real facility login/preparation/submission journey, and page-level overflow checks at **360, 768, 1024 and 1440 px** for the tested public pages and workspace overview/claims/payments/reconciliation screens.
- `pnpm audit --prod`: **no known vulnerabilities found** by the registry audit at execution time. This is not a penetration test.
- `git diff --check`: **passed**. No commit or push performed.
- Public desktop/mobile screenshots were captured and inspected locally; screenshots and traces are ignored development artifacts. Offscreen lazy-loaded images may not appear in a full-page capture until scrolled into view.

## Not claimed as passed

- Live Orange provider, bad real-provider signatures, actual fee distribution or live wallet verification (no contracted API/credentials).
- Real S3/ClamAV upload/malware end-to-end tests (dependencies not configured on this host).
- Real email/SMS delivery (no configured provider credentials).
- Full manual screen-reader/WCAG 2.2 AA certification, all browser engines or every authenticated task screen.
- Full incident-response exercise and production backup/object restoration.
- An approved real-data financial pilot or live-production release. The synthetic Neon/Vercel demo is deployed and tested as recorded above.

Additional test scenarios are retained in `tests/`; browser traces and reports remain ignored local artifacts. See `docs/capabilities.md` for remaining scope.
