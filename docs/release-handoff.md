# LUX HealthPay demo handoff

## Deployed demonstration

- Public site and login: **https://luxllc.vercel.app** and **https://luxllc.vercel.app/login**.
- Vercel project: `lux_llc`, Next.js `apps/web`, Node 24; server-only API proxy configuration.
- New isolated Neon project: `lux-healthpay-demo` / `blue-morning-83165791`; branch `main` / `br-calm-lab-bcgucbxy`; PostgreSQL 18, migrations 001–005.
- Shared API: `https://br-calm-lab-bcgucbxy-luxapi.compute.c-16.us-east-1.aws.neon.tech`.
- Durable worker: separate `luxworker` function; `lux-durable-jobs` trigger every minute. Actual scheduled execution is confirmed in Neon logs. Unauthenticated manual invocations are denied.
- **Legacy `healthwallet-liberia` project remains untouched.** The new foundation schema is not compatible with applying migrations to that legacy database.

## Private credentials

Eight distinct generated passwords are in `.local/hosted-demo-passwords.json`; a readable operator handoff is `.local/hosted-demo-credentials.md`. Both are ignored and permission-restricted on the development machine. They are **not** deployed frontend assets or committed documentation. Do not send them through public issues, shared screenshots or source control. Password reset mail is unavailable until a sender is configured.

| Login                      | Demonstration role                                                  |
| -------------------------- | ------------------------------------------------------------------- |
| `platform@demo.lux.test`   | Organization operations, CMS, approved team/contact content         |
| `luxfinance@demo.lux.test` | LUX fee records                                                     |
| `facility@demo.lux.test`   | Combined synthetic facility clinician/claims/admin/finance workflow |
| `facility2@demo.lux.test`  | Unrelated facility for tenant-denial checks                         |
| `reviewer@demo.lux.test`   | Insurer human review and decisions                                  |
| `finance@demo.lux.test`    | Insurer payment maker/executor                                      |
| `checker@demo.lux.test`    | Independent insurer payment checker                                 |
| `insurer2@demo.lux.test`   | Unrelated insurer for tenant-denial checks                          |

Use separate browser profiles for maker/checker or sign out before switching. Enter only the **displayed generated demo code** at simulated payment confirmation. Never enter a real Orange Money PIN; no actual funds move. Real-data use of these combined demo roles is prohibited.

## Verification and deliverables

Local: 39 backend/domain tests, type checks, production build, and all 9 browser cases across final public/authenticated runs passed. Hosted: 7 public browser cases and end-to-end synthetic API/auth/claim/Orange Money simulation/report smoke passed. Scheduled worker execution verified. Detailed records: `docs/test-results.md`.

- Detailed product requirements: `docs/PRD.md`.
- Implemented versus remaining scope: `docs/capabilities.md`.
- Configuration and independently deployed function release process: `docs/deployment-guide.md`.
- Real Liberian photo sources, rights and limits: `docs/photography.md`; public manifest at `/media/scenes/credits.json`.
- Synthetic hosted smoke: `scripts/hosted-demo-smoke.ts`; requires explicit demo URL/authorization and private credentials.

## Live-production gates

This is **not** a completed live Orange Money integration or an approved clinical/financial production service. Remaining requirements include contracted Orange business API/signature/report/currency/fee specifications and credentials; approved fee incidence/collection; verified organizations/destinations/staff MFA; real private storage and scanner; verified mail/SMS capabilities; legal/privacy/retention approval; model-released product photography where endorsement could be implied; expanded operator controls; manual accessibility/security review and operational recovery/monitoring signoff. Unavailable integrations are not represented as successful.

The user-authorized legacy source reset is part of this rebuild; old source history remains available in Git. Demo source deployment does not authorize deletion of legacy hosted records. A frontend push does not automatically update separately deployed Neon API/worker bundles—redeploy them from the same release when domain code changes.

## Repository release verification

- Rebuild committed and pushed to `origin/main`: **`a89dd2f`** (`a89dd2f9e5f60a567f0f5e79e05144e881fc4b56`).
- Git-triggered Vercel deployment **`dpl_CcZDRwyqV6BZKig6FkWME5j63Ubr`** reached **Ready**, identifies that exact Git SHA and serves the canonical `https://luxllc.vercel.app` alias.
- **After the push and Ready deployment: all 9 hosted browser tests passed in one run (5.7 minutes)**, including real-photo carousel/credits, keyboard team dialogs, every public route, mobile focus/overflow, enquiry persistence, automated accessibility, real facility login/claim submission and responsive authenticated workspace screens.
- **Post-push hosted synthetic API/payment smoke passed again at 10:15 UTC on 11 November 2026**. New synthetic encounter/claim and independent insurer approval/payment were exercised through the canonical frontend proxy, including single-use demo confirmation, command replay and simulated settlement. Reports/PDF/reconciliation and authorization denials passed.
- Final pre-push backend rerun: **39/39 tests passed** (12.07 seconds). Type checks, local optimized build, hosted build and registry production dependency audit passed.
- A documentation/template follow-up records these results and restores the names-only `.env.example` exception after Vercel linking added an overly broad ignore rule. Visual screenshot review also prompted per-photo focal positioning so the portrait-format Monrovia photograph keeps its subject's face in the desktop/mobile crop. No financial/domain behavior changed.
