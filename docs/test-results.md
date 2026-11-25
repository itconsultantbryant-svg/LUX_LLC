# Verification results

## Patient portal, coverage balances and insurer provisioning — 25 November 2026

- Added migration `007_patient_portal.sql`: insured-patient contact email, patient-linked invitations, `patient_accounts` and versioned `patient_coverage_limits`. Migration 007 was applied additively to the canonical local `lux_healthpay` database; no database was reset or reseeded.
- Patient login is derived from an insurer patient reference. It creates no membership and receives no organization permission. The API synthesizes a `PATIENT` context restricted to `/overview`, `/nav` and the patient's own `/patient/*` reads; `/claims`, `/patients` and all other organization routes return `403`.
- The portal shows total claims, monthly and annual cover, insurer-approved usage, remaining balance, pending amounts, policy facts and own claim history. Usage is derived from approved claims by encounter service date; balances are never stored. Pages poll every 20 seconds and on focus.
- Insurers can invite an insured patient from their own reference, publish versioned monthly and annual limits, and see portal status. Cross-insurer references are rejected, and invitation acceptance requires the matching verified email and a self-set password.
- The demo seed adds `patient@demo.lux.test` (Synthetic Patient 08, policy `DEMO-POLICY-7`, USD 1,500 monthly / USD 20,000 annual) with three synthetic claims and one settled payment.
- `pnpm typecheck`: **passed**.
- `pnpm test`: **55/55 passed** on a fresh isolated PostgreSQL database.
- `pnpm build`: **passed** with Next.js 16.4.6.
- Browser suite: **19/19 passed**, including patient scoping, responsive widths and automated axe checks, plus insurer provisioning. The patient and insurer portal tests were rerun after the final claim-amount display adjustment (**2/2 passed**).
- Fixed a pre-existing team profile focus trap so Shift+Tab from the first control stays inside the modal.
- No hosted database, Neon function, real Orange Money transfer, real PIN collection or salary deduction was performed.

## Cross-tenant dashboard and sidebar isolation — 18 November 2026

- Audited every authenticated dashboard, sidebar destination and backing API query. Tenant-owned records are scoped by the caller's `organization_id`, and platform-wide views remain limited to LUX platform roles.
- Fixed a payment-list over-exposure: a facility could receive the paying insurer's `maker_id`, `checker_id`, maker/checker names and `created_by` user ID. Maker/checker identity is now returned only to the insurer; a facility receives the payment and its own settlement facts with those fields redacted.
- Fixed an Orange partner over-exposure: an `ORANGE` organization previously inherited the platform-wide wallet query and could see every facility and insurer wallet balance, funding record and counterparty transfer. Orange now sees only its own wallet, its own funding records and transfers where it is a party. Its fee panel shows only an aggregate Orange share per currency, without counterparties, principal or the LUX share.
- Scoped payroll package/band member counts to the caller's tenant. A facility no longer sees counts that include other facilities' members.
- Hid the facility-only **Encounters** sidebar item from insurer reviewers and auditors, whose clinical permission had exposed a destination that could only return an empty facility-scoped list.
- Added PostgreSQL isolation coverage: facility-to-facility payroll, insurer-to-insurer claims/payments/wallets, facility masking of insurer staff identities, and Orange wallet/fee aggregation. The suite now runs **51/51 tests**.
- `pnpm typecheck`: **passed**.
- `pnpm test`: **51/51 passed**.
- `pnpm build`: **passed** with Next.js 16.4.6.
- Browser suite against the optimized production build: **17/17 passed**, including facility and insurer navigation, scoped dashboards, responsive widths and automated accessibility checks.
- Commit `600dcbe` was pushed to `origin/main`. The canonical Vercel project `lux_llc` deployment `dpl_9fDJeGaXPKNZAYMCMXJdrHoXKbuq` identifies that commit and serves `https://luxllc.vercel.app`; the separate legacy `lux` project still reports failure and is not the canonical alias.
- `luxapi` deployment 8 and `luxworker` deployment 7 were rebuilt and deployed from the same revision.
- Hosted synthetic smoke passed against `https://luxllc.vercel.app`, including payroll scoping, instant four-digit demo settlement, facility wallet credit, LUX/Orange fee conservation, reports, PDF, admin metrics and worker rejection.
- Targeted hosted isolation checks passed: facility payment rows contain no maker/checker names or user IDs, the insurer still sees its own maker identity, the facility wallet and transfer history contain only its own records, and the deployed sidebar shows Encounters to the facility but not to the insurer.
- No database migration, hosted reset, real salary deduction or real Orange Money transfer was performed. Platform operator roles retain their documented network-level oversight.

## Payroll cover, AI validation and instant wallet settlement — 18 November 2026

- Salary-funded cover is modelled as insurer packages with employment bands (`db/migrations/006_payroll_wallet_instant_payments.sql`). The current month's deduction is recorded automatically for every active subscription, once per calendar month, and the payroll ledger keeps gross, deduction and net salary together. All of it is explicitly simulated; no employer payroll system is contacted and no real salary is deducted.
- Insurer and facility payroll dashboards are permission- and tenant-scoped: an insurer sees its own members, a facility sees members registered at its facilities, and LUX finance sees the aggregate. Insurers can enrol an eligible member into a band, and the band fixes the simulated deduction.
- `apps/api/src/validation.ts` holds the shared AI-assisted validation path used by the worker and the insurer-triggered re-run. It records a 0–100 risk score and a structured summary of deterministic checks (coverage, documentation, tariff, duplicate, bill consistency) plus advisory findings. Every run, including a clean one or an unavailable AI adapter, ends at `AWAITING_REVIEW`; AI never approves, declines or moves money.
- Claim detail now returns the latest validation summary, salary-funded cover for the member, payable/allocated amounts and wallet settlement history.
- Demo instant settlement adds a synchronous path alongside the existing asynchronous payment flow. A four-digit code is generated by the API, shown once, stored only as an HMAC and never sent to a payment provider. The code is a demo confirmation, not a real Orange Money PIN; the UI states this explicitly and never asks for a real PIN.
- Settlement moves the insurer debit to the facility wallet and the LUX and Orange fee-share wallets atomically, with the invariant `insurer debit = facility credit + LUX share + Orange share`. The fee model remains 2% total, split 1% LUX / 1% Orange. Reversals restore every wallet.
- Demo float is recorded in the append-only `wallet_fundings` ledger. The backfill funds each insurer with USD 50,000 (5,000,000 minor) once and is idempotent; no customer money is involved and LUX holds no customer money.
- The public homepage was reduced to a hero, a three-role summary, a compact four-step journey, a trust/Orange/AI summary and a final call to action. Detailed journeys, checks, partner content, roadmap and team remain on `/how-it-works`, `/services`, `/partners` and `/about`.
- `pnpm typecheck`: **passed**.
- `pnpm test`: **47/47 tests passed**, including payroll scoping and automatic deductions, new subscriptions, clean and flagged AI validation, instant settlement split and wallet deltas, and wrong-code no-movement. An earlier run under concurrent local load hit one 30-second timeout in an existing dashboard test; it passed on isolated rerun and the full suite then passed cleanly.
- `pnpm build`: **passed** with Next.js 16.4.6.
- Browser suite against the optimized production build: **17/17 passed**, including the simplified homepage, the new payroll and wallet navigation, both new sections and the accessibility/overflow checks.
- Migrations `001`–`006` were applied to the isolated hosted demo database. The idempotent payroll/wallet backfill created 4 packages, 16 bands, 12 subscriptions, 48 deductions and 2 funded insurer wallets, and created the ORANGE partner ledger organization.
- `luxapi` deployment 7 and `luxworker` deployment 6 were rebuilt and deployed from commit `da9b934`.
- The canonical Vercel project `lux_llc` deployed commit `da9b934`; the simplified homepage and both new workspace sections are live. A separate legacy `lux` project check still reports failure but is not the canonical alias.
- Hosted browser checks passed for the new homepage headings and four-step journey, the Payroll and Wallet navigation entries for facility and insurer, both sections returning 200 with four metrics and no horizontal overflow, and wallet ledger rows rendering.
- Hosted synthetic smoke against `https://luxllc.vercel.app` passed: three logins, claim submission, durable validation, human insurer decision, existing demo payment path, payroll scoping, instant four-digit demo settlement, facility wallet credit, LUX/Orange fee conservation, reports, reconciliation, PDF statement, admin metrics and worker rejection. No real funds moved and no real Orange Money PIN was requested.

## Designed workspace sections — 17 November 2026

- Every remaining sidebar destination now uses the same authenticated design system as the dashboards: an image-backed section header, four live metric cards, search and status filters, designed tables or cards, explicit empty states, and compliance notes where a record could be misread.
- Designed sections: returned claims, flagged claims, decisions and appeals, coverage and tariffs, contracted organizations, organizations, organization requests, public enquiries, integration health, validation operations and audit history. The coverage page retains the controlled tariff-publication form; organization requests retain explicit approval; decisions retain separate appeal review.
- Shared primitives in `apps/web/components/modules.tsx` provide the section hero, metric strip, panel, toolbar, focusable table region and card grid. Section styles live in `apps/web/app/globals.css` under the `sec-` prefix and reuse the navy, orange and surface tokens.
- Insurer-controlled decisions, maker/checker separation, the demo-only payment boundary and the rule that LUX never holds customer money are stated in the affected sections. No section claims live Orange Money success or requests a real Orange Money PIN.
- `pnpm typecheck`: **passed**.
- `pnpm test`: **42/42 domain/PostgreSQL tests passed**.
- `pnpm build`: **passed**.
- Browser suite: **17/17 passed** against the optimized production build, including the new journey that signs in as each role and opens every authorized designed section, checks its heading and four metrics, and guards against horizontal overflow. A later repeat run hit one aborted local API connection during sign-in; the affected journey passed immediately on isolated rerun, and no product error was recorded.
- Automated accessibility (axe, WCAG 2 A/AA/2.1/2.2): **0 violations on all 13 designed section pages** for the three roles.
- The login form now declares a POST submit fallback, so a click before hydration cannot place the password in the URL query string.
- Commit `eb6cf94` carries the section design and commit `a2b4ddc` the auth-form hardening. Vercel production deployment `lux-qgoyke1tp` identifies `a2b4ddc` and serves the canonical alias.
- Neon functions were rebuilt and redeployed from this revision: `luxapi` deployment 6 and `luxworker` deployment 5.
- Hosted section checks passed **13/13** against `https://luxllc.vercel.app`, covering every designed section for facility, insurer and admin with a 200 response, the expected level-one heading, four live metrics and no horizontal overflow.

## Team profiles and hosted three-login alignment — 17 November 2026

## Team profiles and hosted three-login alignment — 17 November 2026

- Public team content now follows the supplied structure and order: Maryann Duncan (Co-founder & CEO), Samson Bryant (Co-founder & CTO / Product), Sade Odiaji (Co-founder & Head of Marketing), Boakai K. C. Hina (Co-founder & Head of Provider Network, Operations and Compliance) and Jedidiah Kromah (Co-founder & Head of Finance and Growth). Every profile has an approved role and biography in `packages/config/team.ts`; the seed and hosted `team_members` records carry the same content, and `docs/assets.md` records the portrait provenance.
- Demo mode allows up to 30 sign-ins per minute from one address so reviewers and automated checks can switch accounts quickly; production keeps Better Auth's 3-per-10-seconds sign-in limit.
- `pnpm typecheck`: **passed**.
- `pnpm test`: **42/42 domain/PostgreSQL tests passed** against a freshly recreated isolated `lux_healthpay_test` database.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation and route generation.
- Browser suite against the production build: **16/16 passed**, including the updated team page (new names, roles and biographies, with no pending-biography placeholder) and the full authenticated workspace journeys.
- The isolated hosted demo database (`lux-healthpay-demo`, branch `main`) was reset and reseeded so it contains only the three demonstration logins plus the hidden checker identity. Snapshot branch `pre-three-login-reset-20261116` (`br-dry-cell-bcl0mtw9`) preserves the previous synthetic demo state. The legacy `healthwallet-liberia` project was not touched.
- Neon function bundles were rebuilt from this revision and deployed: `luxapi` deployment 5 and `luxworker` deployment 4. Hosted `/api/v1/health` returned 200 and unauthenticated worker execution returned 401.
- Hosted three-login verification: `facility`, `insurer` and `admin` authenticate through the canonical proxy with their full role sets; `/api/v1/overview`, `/api/v1/nav` and `/api/v1/admin/metrics` returned 200, and the public team endpoint served the new profiles.
- Commit `cf099ca` was pushed to `origin/main`; the Git-triggered Vercel production deployment `lux-eswhs7jiw` identifies that SHA and serves the new copy at the canonical alias.
- Hosted workspace browser checks: **3/3 passed** against `https://luxllc.vercel.app` for the insurer workspace, the LUX admin command centre and facility role navigation; hosted team checks passed **2/2** for the keyboard dialog and supplied portraits/biographies.
- Hosted synthetic smoke passed at 03:37 UTC: three logins, claim submission, durable validation, human insurer decision, explicit demo checker substitution, mandatory demo confirmation, idempotent execution, simulated settlement, PDF statement, reconciliation and admin metrics. No real funds moved and no real Orange Money PIN was requested.

## Authenticated workspace redesign and three-login demo — 15 November 2026

- Demo access is consolidated to **three tested logins**: `facility@demo.lux.test` (facility claims, administration, finance, clinician), `insurer@demo.lux.test` (insurer administration, review, finance, audit) and `admin@demo.lux.test` (platform administration, LUX finance, support, Orange observer). The local demo password is `LuxTest231@`.
- Each dashboard and grouped sidebar exposes the full role set in real time, with permission-aware navigation, live queue badges, a notification centre and role chips. A hidden `internal.checker@demo.lux.test` identity has no auth account and exists only to attribute historical and explicit demo checker steps.
- The LUX admin command centre adds network totals, 14-day claim volume, claim and payment state donuts, fee-allocation evidence, operational health, partner rankings, onboarding requests, recent organizations, an audit feed and active role coverage.
- Facility and insurer dashboards add image-backed heroes, metric cards, 14-day volume bars, payment-lifecycle donuts, work queues, recent claims, money-in-motion panels and an activity trail.
- Explicit demo-only self-check paths exist for payment authorization and destination approval. They require `demoSelfCheck`, only run with `LUX_MODE=demo`, attribute the checker step to the seeded internal identity and write a `DemoCheckerSubstitution` audit event. Without the flag the API still returns `SEPARATE_CHECKER_REQUIRED`.
- `pnpm typecheck`: **passed** for backend, scripts, tests and Next.js.
- `pnpm test`: **42/42 domain/PostgreSQL tests passed** against a freshly recreated isolated `lux_healthpay_test` database. New coverage verifies the demo checker substitution and audit event, scoped dashboard/nav metrics, whole-network platform metrics without clinical claims access, and finance-only redaction.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation, TypeScript and route generation.
- Browser suite against the production build: **16/16 passed**, including all public journeys plus insurer, admin and facility role-navigation checks, the facility claim submission journey, responsive overflow at 360/768/1024/1440 px and automated axe checks on the workspace.
- Accessibility contrast was tightened for the authenticated shell (active navigation, muted text, primary hero action) before the final browser run.
- No hosted database migration, Neon reset or live payment transfer was performed in this local redesign pass. The separate hosted API/worker bundles require redeployment from the same revision.

## Public-site redesign, image heroes and auth screens — 15 November 2026

- `pnpm typecheck`: **passed** for backend, scripts, tests and Next.js.
- `pnpm test`: **39/39 domain/PostgreSQL tests passed** against the isolated `lux_healthpay_test` database.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation, TypeScript and route generation.
- Browser suite against the production build: **13/13 passed** (6.3 minutes) covering the homepage proof points, image-backed hero on every public page, production-facing copy with no disclaimer footnotes, keyboard team dialog, all public routes, supplied portraits, responsive navigation/overflow at 360/768/1024/1440 px, patient and facility enquiries, the split-image login/recovery/invitation screens, axe checks on six public screens including login, the authenticated facility claim journey, and workspace responsiveness.
- Every public page now renders a full-bleed `PageHero` image with a navy overlay; patient/registration/accessibility pages use the clinician-and-patient artwork, family/contact/privacy use the family artwork, and platform/about/partners/team/terms/login use the team artwork.
- Login, forgot-password, reset-password and invitation acceptance use a two-panel image and form layout. Authentication, MFA challenge, invitation and password-reset behaviour is unchanged.
- Registration and contact use a dark “What happens next” card beside a white form; contact defaults to `GENERAL` and registration routes default to `PATIENT`.
- Public marketing pages no longer display synthetic/illustrative labels, operator-review drafts, “no email has been sent” notices, image-caption disclosures or footer disclaimers. Factual boundaries remain in the copy: insurers decide coverage, LUX does not hold customer money, and payment authorization is insurer-controlled. The authenticated workspace keeps its demo-environment banner.
- The public enquiry confirmation now reads “Your enquiry has been recorded. Our team will review it and contact you with the next step.”
- Automated axe checks report no WCAG 2.0/2.1/2.2 A/AA tagged violations on the six tested public screens and the workspace screens. Manual assistive-technology review remains required.
- Local verification used a loopback PostgreSQL test database. **No hosted database migration, Neon reset or live payment transfer was performed.**
- Commit `0ab5df0` was pushed to `origin/main` and its Git-triggered Vercel deployment is live at `https://luxllc.vercel.app`. Post-push hosted checks passed **3/3**: image-backed hero on every public page, production-facing copy with no disclaimer footnotes, and the split-image auth layout. Hosted `/`, `/services`, `/get-started`, `/contact`, `/privacy`, `/login` and `/media/illustrations/credits.json` returned 200.

## Public-site illustration pass — 14 November 2026 (superseded by the 15 November record above)

- `pnpm typecheck`: **passed** for backend, scripts, tests and Next.js after the patient-first redesign and illustration pipeline.
- `pnpm test`: **39/39 domain/PostgreSQL tests passed** (24.9 seconds) against a freshly recreated isolated `lux_healthpay_test` database. Includes the new `PATIENT` enquiry audience and rejection of unknown enquiry kinds.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation, TypeScript and route generation.
- Local browser suite: **11/11 passed** against the running API/web with synthetic seed data — 9 public cases (hero imagery/provenance, patient journey and demo boundaries, keyboard team dialog, all public routes, supplied team fidelity, responsive navigation/overflow at 360/768/1024/1440, patient enquiry, facility enquiry and axe accessibility) plus 2 authenticated workspace cases (facility claim submission and responsive/axe workspace screens).
- Automated axe checks report no WCAG 2.0/2.1/2.2 A/AA tagged violations on Home, Get Started, Team and the tested workspace screens. Manual assistive-technology review remains required.
- Public hub `/` now uses the supplied illustrative AI concept artwork with visible disclosures, responsive AVIF/WebP/JPEG derivatives, SHA-256 provenance and `/media/illustrations/credits.json`. The obsolete real-photo scenes and carousel were removed.
- Local verification used a loopback PostgreSQL test database. **No hosted deployment, Neon reset or live payment transfer was performed as part of this redesign review.**

## Previous release — 11 November 2026

- `pnpm test`: **39 domain/PostgreSQL tests passed**; final pre-push rerun completed in 12.07 seconds, including new demo confirmation expiry/attempt/idempotency checks and safe team contact links.
- `pnpm typecheck`: **passed** for backend, scripts, tests and Next.js after the current enhancements.
- `pnpm build`: **passed** with Next.js 16.4.6 optimized compilation and route generation. Vercel's production build/deployment also succeeded.
- Local browser coverage: **all 9 tests passed across the final public (7) and authenticated (2) runs**. An initial suite run timed out; the next complete run exposed a genuine draft-restoration race. “Start a fresh draft” now waits for draft hydration. Its claim-submission regression and the workspace responsive test passed after the fix; the multi-route workspace test receives a realistic execution budget on this host.
- **Hosted public browser suite: 7/7 passed** at `https://luxllc.vercel.app` (3.8 minutes): real-photo attribution/loaded images/reduced motion, team keyboard modal/focus return, all public routes, supplied team fidelity, responsive navigation/overflow, enquiry persistence and axe checks.
- **Hosted synthetic API/auth/payment workflow: passed**, 11 November 2026 at 10:02 UTC. Five uniquely credentialed actors signed in through the Vercel same-origin proxy; verified anonymous/signup denials, tenant denial, coverage/encounter creation, immutable claim submission, durable validation, human insurer approval, independent maker/checker, mandatory four-digit demo confirmation, idempotent execution, simulated settlement, scoped reports/reconciliation/PDF and unauthenticated-worker denial. No actual funds or real patient data were used.
- New isolated Neon project `lux-healthpay-demo` (`blue-morning-83165791`), PostgreSQL 18, migrations **001–005** applied and synthetic seed successful. The legacy database was not migrated or reset.
- Neon shared `luxapi` and `luxworker` bundles deployed successfully. Every-minute trigger is enabled; provider logs show **`scheduled:true`** durable-job batches. This verifies actual scheduled invocations, not just trigger creation.
- Historical real-photography build (superseded by the 14 November 2026 illustration pipeline): six responsive sets, three documented Liberian originals and SHA-256 provenance. The supplied team portraits and LUX artwork were unchanged.
- `pnpm audit --prod`: **no known vulnerabilities found**. `git diff --check`: passed before release staging.
- Private credentials/secrets are excluded by `.gitignore` and `.vercelignore`; eight unique demo account passwords are handed off under ignored `.local/` files, not in source.

**Post-push verification:** rebuild commit `a89dd2f` was pushed to `origin/main`; its Git-triggered Vercel deployment reached Ready and owns the canonical alias. **All 9 hosted browser tests passed in a single post-push run (5.7 minutes)**, including authenticated facility claim submission and workspace accessibility/responsiveness. The hosted synthetic API/claim/payment/report smoke passed again at **10:15 UTC**, after that deployment. See `docs/release-handoff.md`. Historical results below are retained as an execution record, not current release limitations.

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
