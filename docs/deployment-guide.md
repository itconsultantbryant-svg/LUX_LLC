# Deployment: Neon + Vercel + separate API/worker

The hosted **synthetic demonstration** is deployed to Vercel and Neon Functions. This is not approval for real clinical data or live financial activity. Secrets are held in provider environments and ignored private local handoff files, never in committed source. See `docs/release-handoff.md` for the verified release details.

## Database

1. Create a **new Neon project/branch/database** for this rebuilt schema. Preserve the old system’s database and backups. Do not apply the foundation migrations to the old database.
2. Use Neon’s official TLS connection string. Pooled connections suit application traffic; use a direct connection for migration/backup operations when recommended by Neon.
3. Set `DATABASE_URL` only in server/worker/migration environments. Never expose it to the browser.
4. Run `pnpm db:migrate` once as a release job using migration-owner credentials. Checksummed migrations serialize under an advisory lock.
5. Grant a limited application role and restrict network access. Establish retention/PITR and a tested object/database backup policy.

## API and worker (Render or container host)

Build the root `Dockerfile`. API start: the default command. Worker command:

```sh
node --import tsx apps/worker/src/main.ts
```

Run as separate services from the same versioned image, using the same database. Set `PORT=4000` if the host does not inject its own port. Health path is `/api/v1/health`. A healthy database is necessary, not proof a payment provider is ready. Observe dead jobs and outstanding unknown payments, not just HTTP uptime.

For a real-data environment set `NODE_ENV=production`, `LUX_MODE=manual` or `unconfigured` until actual provider integration is approved. A hosted synthetic demo must explicitly set **both** `DEPLOYMENT_TIER=demo` and `LUX_MODE=demo`, use exact HTTPS origins and contain only synthetic organizations; otherwise production demo startup is rejected. Live/sandbox execution is unavailable until a real contracted adapter is implemented; changing an environment string does not enable it.

Provide `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://<frontend-domain>`, `WEB_ORIGIN=https://<frontend-domain>`. The frontend domain must be exact and trusted. Do not trust arbitrary forwarded IP headers; configure the host/proxy chain before relying on per-client rate limits. Route access to the API through the approved frontend ingress; do not create wildcard CORS.

Configure server-only S3/ClamAV variables for attachments. Create a **private** bucket in MinIO/S3 administration; no bucket provisioning is silently performed. Configure short-lived quarantine upload CORS for the frontend origin only. Production should use managed storage, encrypted objects and scanner monitoring. No storage credentials means uploads fail explicitly.

Mail uses Resend’s actual HTTPS API only when `MAIL_API_KEY` and `MAIL_FROM` are set. Verify the sender domain and recipient policy. No key means no email is claimed as sent. Enquiries are still stored. SMS is not integrated.

## Vercel

Import this repository as a monorepo. Select **`apps/web` as Root Directory**, use the Next.js framework preset, install with pnpm and build with `pnpm build` in that workspace. Enable access to source outside the root if the Vercel project setting requires it (shared team content lives under `packages/config`). Vercel recognizes the root pnpm workspace/lockfile.

Set `API_INTERNAL_URL=https://<api-service-domain>` in Vercel’s server/build environment. Next’s rewrite proxies `/api/*` to that API, preserving a same-origin cookie experience. Verify Set-Cookie forwarding, secure cookie flags and authentication/MFA behind the actual deployed proxy. The Next server also fetches published public content from this URL. **No provider/database secrets belong in Vercel public variables.**

No production secrets, domains or existing project IDs are hardcoded. Promotion from preview must not copy demo memberships, provider references or `.env` files.

## Neon Functions deployment used for the demo

1. Preserve the legacy Neon project. Create a new isolated project and obtain its connection string privately.
2. Run migrations and seed only the empty demo database, with `ALLOW_DEMO_SEED=true`, nonproduction seed runtime, `LUX_MODE=demo` and `DEMO_PASSWORDS_FILE` pointing to a private JSON map of eight unique account passwords. Never run the seed against a populated database.
3. Build `pnpm exec tsx scripts/build-neon.ts`. Deploy `dist/neon/luxapi/index.mjs` and `dist/neon/luxworker/index.mjs` using `neon functions deploy <slug> --src <file> --no-bundle --project-id <new-project> --branch main`. Inject secrets through a private deployment process, not shell history or committed config. The branch injects `DATABASE_URL` automatically.
4. Set backend/worker `BETTER_AUTH_SECRET`, exact `BETTER_AUTH_URL`/`WEB_ORIGIN`, `NODE_ENV=production`, `DEPLOYMENT_TIER=demo`, `LUX_MODE=demo`, `LUX_NEON_RUNTIME=true` and a high-entropy `WORKER_TRIGGER_SECRET`. Never deploy seed-password files/variables into functions.
5. Create the worker schedule with `neon triggers create --name lux-durable-jobs --function-slug luxworker --cron '* * * * *' --project-id <new-project> --branch main`. Confirm **actual** `scheduled:true` durable-job batch logs, not just existence of a trigger. Manual worker requests require the secret bearer token; the ordinary public API cannot invoke jobs.
6. Set Vercel `API_INTERNAL_URL` to the deployed `luxapi` origin and use `apps/web`, Next.js, Node 24. `.vercelignore` excludes local database sockets, secrets and build/test artifacts. Deploy and exercise same-origin sign-in/cookies and workflows at the canonical HTTPS alias.
7. Rebuild/redeploy function bundles after API/domain changes. A frontend Git push alone does not redeploy these independently hosted functions. Match API/worker and frontend source revisions in release records.

To run the synthetic hosted smoke script, supply `SMOKE_BASE_URL`, `ALLOW_SYNTHETIC_SMOKE=true`, private `DEMO_PASSWORDS_FILE`, `WORKER_URL` and `WORKER_TRIGGER_SECRET`, then `pnpm exec tsx scripts/hosted-demo-smoke.ts`. It deliberately creates synthetic encounters, claims and simulated payments; never run it in a real-data environment.

## First production operator

Do not run `db:seed` in production. Run the one-use `scripts/bootstrap-admin.ts` only after the operator verifies the initial administrator’s identity/email out of band. Supply `BOOTSTRAP_APPROVED=true`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_NAME`, `BOOTSTRAP_PASSWORD` and remove them immediately after creation. Enrol TOTP via Settings before privileged domain operations. Bootstrap is audited and refuses an existing LUX organization. Do not commit these values.

Organizations enter through stored public requests and explicit administrative approval. Invitations, roles, active contracts, insurer coverage sources and destinations must be configured by authorized staff. A new organization is not a claim/payment integration by itself.

## Release checklist

- Run types, PostgreSQL tests, browser journeys, dependency/security checks and a production build.
- Approve privacy/terms, processing basis, retention, final bios/portraits and public contact details.
- Obtain original authorized Orange marks; retain real-photo source/license credits and obtain model-released commissioned images for testimonials or product-specific promotional portraits. See `docs/photography.md`.
- Complete manual keyboard/screen-reader checks and responsive checks for all critical task screens.
- Exercise password reset, MFA recovery, invitation expiry and membership suspension behind production ingress.
- Exercise private storage, MIME/size/malware failures and backup restoration.
- Obtain a contracted provider capability/signature/report specification and certified test credentials. Test delayed/out-of-order results, ambiguous timeouts and reversals against it.
- Approve fee incidence, rounding/currency exponents, payer disclosures, authorized limits and actual collection/allocation process.
- Approve cancellation/funding/adjustment commands and reconciliation exception coverage before live finance use.
- Assign named incident/reconciliation owners and review dead jobs/unknown payment alerts.

User-authorized deployment has been performed for the explicitly synthetic demo. Repository release state and actual hosted/local test outcomes are recorded separately; do not infer live-production readiness from deployment success.
