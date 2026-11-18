# LUX HealthPay demo handoff

## Payroll, validation and instant settlement status

Salary-funded insurance packages now link to employment bands and record a simulated monthly deduction for every active member. Facilities and insurers see scoped payroll dashboards, claim detail shows the member's cover, and the insurer can run the current period's deduction idempotently. AI-assisted validation produces a deterministic risk summary with advisory findings; it never approves, declines or moves money, and every claim still ends at human insurer review.

The demo instant-payment path issues a server-generated four-digit confirmation code, shown once and stored only as an HMAC. It is not a real Orange Money PIN and is never sent to a provider. Confirming it settles the insurer's simulated wallet to the facility wallet and the LUX/Orange fee-share wallets atomically, with 1% LUX and 1% Orange of the 2% service fee. The facility and platform wallet views refresh every three seconds, and every record is labelled simulated. Demo float is recorded in an append-only ledger; LUX holds no customer money.

Verification on 18 November 2026: type checks passed, the production build passed, 17/17 browser cases passed against it, and all 51 domain/PostgreSQL tests passed. Migration `006` and the idempotent payroll/wallet backfill were applied to the hosted demo database. Commit `da9b934` was pushed, and `luxapi` deployment 7 and `luxworker` deployment 6 carry the matching API. The hosted synthetic smoke passed payroll scoping, instant demo settlement, facility wallet credit and fee conservation against `https://luxllc.vercel.app`.

## Tenant isolation status

Every tenant dashboard and sidebar destination was reviewed against its API query. Claims, payments, payroll, reconciliation, reports, audit history, support, users, contracts and catalogue data are scoped to the selected organization; platform-wide views remain restricted to LUX platform roles. A facility no longer receives the paying insurer's maker/checker identities or user IDs from the payment list. An Orange partner organization sees only its own wallet, fundings and party transfers, plus an aggregate Orange fee share without counterparties; it no longer inherits the LUX network-wide ledger. Payroll package and band member counts are tenant-scoped, and the facility-only Encounters sidebar item is hidden from insurer clinical roles. PostgreSQL isolation tests now cover facility-to-facility payroll, insurer-to-insurer claims/payments/wallets, facility identity redaction and Orange aggregation; the suite is **51/51**. No migration or hosted data reset was required for these application-layer fixes. Commit `600dcbe` is live through Vercel `lux_llc` deployment `dpl_9fDJeGaXPKNZAYMCMXJdrHoXKbuq`; `luxapi` deployment 8 and `luxworker` deployment 7 carry the matching API. Hosted checks confirmed the redaction, facility wallet scope and role-aware sidebar, and the synthetic smoke passed.

## Workspace section design status

All sidebar destinations now match the dashboard design system. Returned claims, flagged claims, decisions and appeals, coverage and tariffs, contracted organizations, organizations, organization requests, public enquiries, integration health, validation operations and audit history each have an image-backed header, live metric cards, search and status filters, a designed table or card view, explicit empty states, and permission-scoped records. Insurer control of coverage and decisions, maker/checker separation, simulated-payment labeling and the no-customer-money rule remain visible where they apply. Verification on 17 November 2026 passed 42/42 domain/PostgreSQL tests, type checks, the production build, 17/17 browser cases and axe checks with zero violations across all designed section pages.
Commit `eb6cf94` (sections) and `a2b4ddc` (pre-hydration credential hardening) are deployed through Vercel `lux-qgoyke1tp`; `luxapi` deployment 6 and `luxworker` deployment 5 carry the matching API. Hosted section checks passed 13/13 across the three demo roles.

## Team profiles and hosted alignment status

## Team profiles and hosted alignment status

The public team page now follows the supplied five-person structure: Maryann Duncan (Co-founder & CEO), Samson Bryant (Co-founder & CTO / Product), Sade Odiaji (Co-founder & Head of Marketing), Boakai K. C. Hina (Co-founder & Head of Provider Network, Operations and Compliance) and Jedidiah Kromah (Co-founder & Head of Finance and Growth), each with an approved biography. The isolated hosted demo database was reseeded for the three-login model, and the `luxapi` and `luxworker` functions were redeployed from this revision. Verification on 17 November 2026 passed **42/42 domain/PostgreSQL tests**, type checks, the optimized build and **16/16 browser cases** locally, plus **3/3 hosted workspace browser checks** and the hosted three-login synthetic smoke. The legacy `healthwallet-liberia` project was not changed.

## Authenticated workspace redesign status

The authenticated demo was rebuilt around **three tested logins** with the shared local demo password `LuxTest231@`: `facility@demo.lux.test`, `insurer@demo.lux.test` and `admin@demo.lux.test`. Each login carries every role for its organization, and each dashboard/sidebar exposes the full workflow. Local verification on 15 November 2026 passed **42/42 domain/PostgreSQL tests**, type checks, the optimized build and the **full 16-case browser suite**. Production-facing public pages and public copy were preserved. The hidden `internal.checker@demo.lux.test` identity has no auth account and records only historical or explicit demo self-check steps; normal API calls still return `SEPARATE_CHECKER_REQUIRED`. No hosted database or Neon function was changed in this pass; redeploy the API/worker bundles from the same revision before hosted dashboard verification.

## Public-site redesign status

The production-facing redesign was verified locally on 15 November 2026: 39/39 domain/PostgreSQL tests, type checks, the optimized build and 13/13 browser cases against the production build passed. Every public page now has an image-backed hero, login/recovery/invitation use a split image layout, registration and contact share a redesigned form, and public disclaimer footnotes were removed while factual product boundaries remain. Asset provenance is documented in `docs/assets.md`. Commit `0ab5df0` was pushed to `origin/main` and its Git-triggered Vercel deployment is live at `https://luxllc.vercel.app`; the hosted hero, production-copy and auth-layout browser checks passed after deployment. No hosted database action was performed.

## Deployed demonstration

- Public site and login: **https://luxllc.vercel.app** and **https://luxllc.vercel.app/login**.
- Vercel project: `lux_llc`, Next.js `apps/web`, Node 24; server-only API proxy configuration.
- New isolated Neon project: `lux-healthpay-demo` / `blue-morning-83165791`; branch `main` / `br-calm-lab-bcgucbxy`; PostgreSQL 18, migrations 001–006.
- Shared API: `https://br-calm-lab-bcgucbxy-luxapi.compute.c-16.us-east-1.aws.neon.tech`.
- Durable worker: separate `luxworker` function; `lux-durable-jobs` trigger every minute. Actual scheduled execution is confirmed in Neon logs. Unauthenticated manual invocations are denied.
- **Legacy `healthwallet-liberia` project remains untouched.** The new foundation schema is not compatible with applying migrations to that legacy database.

## Private credentials

The three demonstration accounts share the local demo password `LuxTest231@`. A readable operator handoff is `.local/hosted-demo-credentials.md`; the optional private map is `.local/hosted-demo-passwords.json`. Local files are ignored and permission-restricted on the development machine. Do not send passwords through public issues, shared screenshots or source control. Password reset mail is unavailable until a sender is configured.

| Login                    | Demonstration roles                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| `facility@demo.lux.test` | Facility claims, administration, finance and clinician roles                |
| `insurer@demo.lux.test`  | Insurer administration, review, finance and audit roles                     |
| `admin@demo.lux.test`    | LUX platform administration, LUX finance, support and Orange observer roles |

Each login exposes its full role set in one dashboard and sidebar. The seeded `internal.checker@demo.lux.test` identity has no auth account and exists only to attribute historical and explicit demo self-check steps; it is not a fourth login. Production still requires separate human maker and checker accounts. Enter only the **displayed generated demo code** at simulated payment confirmation. Never enter a real Orange Money PIN; no actual funds move. Real-data use of these combined demo roles is prohibited.

## Verification and deliverables

The 17 November 2026 verification passed 42 backend/domain tests, type checks, the production build and 16 browser cases, covering every public page, the updated five-person team profiles, patient and facility enquiries, the split-image auth screens and the three authenticated workspaces with responsive and accessibility checks. Hosted checks after redeployment passed 3/3 workspace browser cases and the full synthetic API/claim/payment smoke at `https://luxllc.vercel.app`. Detailed records: `docs/test-results.md`.

- Detailed product requirements: `docs/PRD.md`.
- Implemented versus remaining scope: `docs/capabilities.md`.
- Configuration and independently deployed function release process: `docs/deployment-guide.md`.
- Supplied illustration provenance, crop metadata and usage boundaries: `docs/assets.md`; public manifest at `/media/illustrations/credits.json`.
- Synthetic hosted smoke: `scripts/hosted-demo-smoke.ts`; requires explicit demo URL/authorization and private credentials.

## Live-production gates

This is **not** a completed live Orange Money integration or an approved clinical/financial production service. Remaining requirements include contracted Orange business API/signature/report/currency/fee specifications and credentials; approved fee incidence/collection; verified organizations/destinations/staff MFA; real private storage and scanner; verified mail/SMS capabilities; legal/privacy/retention approval; model-released product photography and operator approval of illustrative AI imagery where endorsement could be implied; expanded operator controls; manual accessibility/security review and operational recovery/monitoring signoff. Unavailable integrations are not represented as successful.

The user-authorized legacy source reset is part of this rebuild; old source history remains available in Git. Demo source deployment does not authorize deletion of legacy hosted records. A frontend push does not automatically update separately deployed Neon API/worker bundles—redeploy them from the same release when domain code changes.

## Repository release verification

### 17 November 2026 team profiles and hosted three-login alignment

- Team content updated to the supplied five co-founder roles and biographies, in the supplied order; portrait provenance remains recorded in `docs/assets.md`.
- Local verification: **42/42 tests**, type checks, optimized build and **16/16 browser cases**.
- Hosted isolated demo database reset and reseeded with only the three demonstration logins; snapshot branch `pre-three-login-reset-20261116` (`br-dry-cell-bcl0mtw9`) preserves the prior synthetic demo state. Legacy `healthwallet-liberia` untouched.
- Commit `cf099ca` (`cf099cae12a458bf954379e6a7138af4dc16a5c6`) pushed to `origin/main`; Vercel production deployment `lux-eswhs7jiw` identifies that SHA and serves the canonical alias with the new team copy.
- `luxapi` deployment 5 and `luxworker` deployment 4 deployed from this revision. Hosted health 200, unauthenticated worker 401.
- Hosted team browser checks **2/2** passed (keyboard dialog and supplied portraits/biographies).
- Hosted three-login API checks passed for `/me`, `/overview`, `/nav` and `/admin/metrics`; hosted workspace browser checks **3/3**; hosted synthetic smoke passed at 03:37 UTC, including demo self-check and simulated settlement with no real funds.

### 15 November 2026 public redesign

- Redesign committed and pushed to `origin/main`: **`0ab5df0`** (`0ab5df05bdb54e0e92cfea0c75b0676dda250431`).
- Git-triggered Vercel deployment became ready within about a minute and serves the canonical `https://luxllc.vercel.app` alias with the new public metadata and image heroes.
- **Post-push hosted browser checks passed 3/3**: image-backed hero on every public page, production-facing copy with no disclaimer footnotes, and the split-image login/recovery/invitation layout.
- Hosted public routes `/`, `/services`, `/get-started`, `/contact`, `/privacy` and `/login` returned 200; `/media/illustrations/credits.json` returned 200.
- Final pre-push local rerun: **39/39 tests**, type checks, optimized build and **13/13 browser cases**. No hosted database migration or mutation was performed; the separately deployed Neon API/worker bundles were not changed by this frontend release.

### 11 November 2026 release

- Rebuild committed and pushed to `origin/main`: **`a89dd2f`** (`a89dd2f9e5f60a567f0f5e79e05144e881fc4b56`).
- Git-triggered Vercel deployment **`dpl_CcZDRwyqV6BZKig6FkWME5j63Ubr`** reached **Ready**, identifies that exact Git SHA and serves the canonical `https://luxllc.vercel.app` alias.
- **After the push and Ready deployment: all 9 hosted browser tests passed in one run (5.7 minutes)**, including real-photo carousel/credits, keyboard team dialogs, every public route, mobile focus/overflow, enquiry persistence, automated accessibility, real facility login/claim submission and responsive authenticated workspace screens.
- **Post-push hosted synthetic API/payment smoke passed again at 10:15 UTC on 11 November 2026**. New synthetic encounter/claim and independent insurer approval/payment were exercised through the canonical frontend proxy, including single-use demo confirmation, command replay and simulated settlement. Reports/PDF/reconciliation and authorization denials passed.
- Final pre-push backend rerun: **39/39 tests passed** (12.07 seconds). Type checks, local optimized build, hosted build and registry production dependency audit passed.
- A documentation/template follow-up records these results and restores the names-only `.env.example` exception after Vercel linking added an overly broad ignore rule. Visual screenshot review also prompted per-photo focal positioning so the portrait-format Monrovia photograph keeps its subject's face in the desktop/mobile crop. No financial/domain behavior changed.
