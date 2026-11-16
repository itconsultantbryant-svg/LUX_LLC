# LUX HealthPay demo handoff

## Authenticated workspace redesign status

The authenticated demo was rebuilt around **three tested logins** with the shared local demo password `LuxTest231@`: `facility@demo.lux.test`, `insurer@demo.lux.test` and `admin@demo.lux.test`. Each login carries every role for its organization, and each dashboard/sidebar exposes the full workflow. Local verification on 15 November 2026 passed **42/42 domain/PostgreSQL tests**, type checks, the optimized build and the **full 16-case browser suite**. Production-facing public pages and public copy were preserved. The hidden `internal.checker@demo.lux.test` identity has no auth account and records only historical or explicit demo self-check steps; normal API calls still return `SEPARATE_CHECKER_REQUIRED`. No hosted database or Neon function was changed in this pass; redeploy the API/worker bundles from the same revision before hosted dashboard verification.

## Public-site redesign status

The production-facing redesign was verified locally on 15 November 2026: 39/39 domain/PostgreSQL tests, type checks, the optimized build and 13/13 browser cases against the production build passed. Every public page now has an image-backed hero, login/recovery/invitation use a split image layout, registration and contact share a redesigned form, and public disclaimer footnotes were removed while factual product boundaries remain. Asset provenance is documented in `docs/assets.md`. Commit `0ab5df0` was pushed to `origin/main` and its Git-triggered Vercel deployment is live at `https://luxllc.vercel.app`; the hosted hero, production-copy and auth-layout browser checks passed after deployment. No hosted database action was performed.

## Deployed demonstration

- Public site and login: **https://luxllc.vercel.app** and **https://luxllc.vercel.app/login**.
- Vercel project: `lux_llc`, Next.js `apps/web`, Node 24; server-only API proxy configuration.
- New isolated Neon project: `lux-healthpay-demo` / `blue-morning-83165791`; branch `main` / `br-calm-lab-bcgucbxy`; PostgreSQL 18, migrations 001–005.
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

The 15 November 2026 local redesign verification passed 39 backend/domain tests, type checks, the production build and 13 browser cases, including every public page hero, production-facing copy checks, the split-image auth screens, patient and facility enquiries, the authenticated claim journey and responsive/axe checks. The earlier 11 November hosted release recorded 7 public browser cases plus the end-to-end synthetic API/auth/claim/Orange Money simulation/report smoke; scheduled worker execution was also verified. Detailed records: `docs/test-results.md`.

- Detailed product requirements: `docs/PRD.md`.
- Implemented versus remaining scope: `docs/capabilities.md`.
- Configuration and independently deployed function release process: `docs/deployment-guide.md`.
- Supplied illustration provenance, crop metadata and usage boundaries: `docs/assets.md`; public manifest at `/media/illustrations/credits.json`.
- Synthetic hosted smoke: `scripts/hosted-demo-smoke.ts`; requires explicit demo URL/authorization and private credentials.

## Live-production gates

This is **not** a completed live Orange Money integration or an approved clinical/financial production service. Remaining requirements include contracted Orange business API/signature/report/currency/fee specifications and credentials; approved fee incidence/collection; verified organizations/destinations/staff MFA; real private storage and scanner; verified mail/SMS capabilities; legal/privacy/retention approval; model-released product photography and operator approval of illustrative AI imagery where endorsement could be implied; expanded operator controls; manual accessibility/security review and operational recovery/monitoring signoff. Unavailable integrations are not represented as successful.

The user-authorized legacy source reset is part of this rebuild; old source history remains available in Git. Demo source deployment does not authorize deletion of legacy hosted records. A frontend push does not automatically update separately deployed Neon API/worker bundles—redeploy them from the same release when domain code changes.

## Repository release verification

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
