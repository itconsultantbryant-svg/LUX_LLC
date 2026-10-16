# Deployment guide

How to build, deploy, and verify HealthWallet Liberia. The frontend runs on
Vercel, the backend runs as a Neon Function, and the database is Neon
PostgreSQL. Everything here is repeatable and safe to run by hand; the same
commands run in CI.

> **First read:** [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) (required inputs
> and activation sequence) and [NEON_DEVELOPMENT.md](./NEON_DEVELOPMENT.md) (Neon
> project identifiers). This guide is the operational companion to those.

## 1. Architecture at a glance

```
Browser
  │  same-origin HTTPS
  ▼
Vercel (static Vite build)  ──  Vercel Edge Middleware (root middleware.ts)
                                      │  adds header  x-secret: $ORIGIN_SECRET
                                      │  adds header  x-healthwallet-client-ip
                                      ▼
                                 Neon Function (apps/api/src/neon.ts)
                                      │  timing-safe x-secret check, strips x-*
                                      ▼
                                 Neon PostgreSQL (DATABASE_URL, pooled)
```

- The browser only ever talks to the Vercel origin. There is no CORS surface in
  production and the browser never sees `ORIGIN_SECRET`.
- The API is stateless; all durable state is in Neon. Sessions are cookies
  scoped to the Vercel domain.
- Background work (reconciliation, retention) is **not** part of the request
  path; it runs on a schedule (see [MONITORING.md](./MONITORING.md)).

Two files implement the proxy and must live at the Vercel **project root**
(Root Directory = repository root):

| File            | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `vercel.json`   | Build/output config, SPA fallback, security headers       |
| `middleware.ts` | Edge proxy that injects the server-only `x-secret` header |

## 2. Prerequisites

- Node 24 (see `.nvmrc`) and pnpm 11.
- `neon` CLI (Neon project/branch/deploy). Authenticate with `neon auth`.
- A Vercel account (Connect your Git provider, or use `vercel` CLI with a token).
- Access to the Neon project that hosts the branch and function.

## 3. Environment variables

Full reference: [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). Summary:

- **Neon Function (backend):** `APP_ENV`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `CORS_ORIGIN`, adapter selectors (`AI_ADAPTER`, `PAYMENT_ADAPTER`,
  `MESSAGING_ADAPTER`, `PHONE_VERIFICATION_PROVIDER`, `STORAGE_ADAPTER`),
  `SECURITY_ENCRYPTION_KEY`, `PAYMENT_CALLBACK_SECRET`, `ORIGIN_SECRET`, and the
  `S3_*` storage values.
- **Vercel (frontend):** `VITE_APP_ENV` (build-time, e.g. `demo`), optional
  `VITE_API_BASE_URL` (leave empty for same-origin), and the **server-only**
  `NEON_FUNCTION_URL` + `ORIGIN_SECRET` used by Edge Middleware.

Never prefix a secret with `VITE_`. `VITE_*` values are embedded in the browser
bundle.

## 4. Deploy the backend (Neon Function)

The function is declared in the repository root `neon.ts` (function name
`healthwallet`, source `apps/api/src/neon.ts`). Its handler is
`apps/api/src/neon-handler.ts`.

```bash
# 1. Authenticate and select the project/branch
neon auth
neon branches list

# 2. Configure function environment variables on the branch
#    (use `neon env set` with values from your secret manager; see docs/ENVIRONMENT_VARIABLES.md)

# 3. Apply migrations (use the UNPOOLED connection string)
APP_ENV=demo DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" pnpm db:migrate

# 4. (Demo/staging only) seed synthetic records
APP_ENV=demo DATABASE_URL="$DATABASE_URL" pnpm db:seed

# 5. Deploy
neon deploy

# 6. Capture the function URL printed by the deploy; this is NEON_FUNCTION_URL
```

The deployment result must satisfy the config preflight before you point real
traffic at it:

```bash
APP_ENV=production pnpm deploy:check   # offline; validates production requirements
```

## 5. Deploy the frontend (Vercel)

Vercel project settings:

- **Root Directory:** repository root.
- **Install Command:** `pnpm install --frozen-lockfile` (from `vercel.json`).
- **Build Command:** `pnpm build:shared && pnpm --filter @healthwallet/web build`
  (from `vercel.json`).
- **Output Directory:** `apps/web/dist` (from `vercel.json`).
- **Framework Preset:** Other / none (from `vercel.json`).

Environment variables (Vercel project → Settings → Environment Variables):

| Name                | Scope  | Value                                            |
| ------------------- | ------ | ------------------------------------------------ |
| `VITE_APP_ENV`      | Build  | `demo` (labels the deployment as a simulation)   |
| `VITE_API_BASE_URL` | Build  | empty (same-origin through Edge Middleware)      |
| `NEON_FUNCTION_URL` | Server | the URL captured in §4                           |
| `ORIGIN_SECRET`     | Server | identical to the backend value (≥ 32 characters) |

Deploy by pushing to the connected branch, or:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

`middleware.ts` is deployed automatically and proxies `/api/*`, `/health`, and
`/ready` to `NEON_FUNCTION_URL`. If `NEON_FUNCTION_URL` or `ORIGIN_SECRET` is
missing, the proxy returns `503` with a clear message rather than leaking a
backend error.

### Without Edge Middleware (fallback)

If you cannot use Edge Middleware, host a tiny reverse proxy (Cloudflare
Worker, Fly, or your own Node service) that performs the same job: add
`x-secret` and `x-healthwallet-client-ip`, strip `host`/`x-forwarded-*`, and
forward to the Neon Function. The Vite dev proxy in `apps/web/vite.config.ts` is
a working reference implementation.

## 6. Database migrations

Migrations are hand-written SQL in `apps/api/drizzle/` and are applied with the
idempotent runner `apps/api/src/db/migrate.ts`.

```bash
# Local / demo: migrate the database named in DATABASE_URL
APP_ENV=demo DATABASE_URL=... pnpm db:migrate

# Production: always run against the UNPOOLED connection string, before the
# function deploy that depends on the new schema
APP_ENV=production DATABASE_URL_UNPOOLED=... pnpm db:migrate
```

Rules:

- Migrations run **before** the function deploy that needs them, never after.
- Use `DATABASE_URL_UNPOOLED` for migrations (poolers reject some DDL).
- Migrations are additive by preference; see [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)
  for the rollback procedure when a change is not backward compatible.
- Seed runs only against a database whose name ends in `_dev`, `_demo`, or
  `_test`, and only with `--synthetic` (the `db:seed` script already passes it).

See [MIGRATIONS.md](./MIGRATIONS.md) for the expand/contract pattern and the
change checklist.

## 7. Deploy a labelled demo environment

A demo deployment is a first-class environment: real stack, synthetic records,
sandbox adapters, and visible simulation labels.

1. Create or select a Neon branch for the demo; set `APP_ENV=demo`,
   `DATABASE_URL`/`DATABASE_URL_UNPOOLED` to the demo database
   `healthwallet_demo`, and keep every adapter on `sandbox`.
2. Migrate and seed synthetic records (§4, §6).
3. Deploy the Neon function, then deploy Vercel with `VITE_APP_ENV=demo`.
4. Verify:

   ```bash
   node deploy/verify-demo.mjs https://YOUR-DEMO-ORIGIN
   ```

   Expect all checks to pass: health `ok`, `simulation: true`, adapters
   `sandbox`, `ready` database `true`, `/api/meta` served, anonymous access to
   protected routes rejected with `401`.

To run the full demo locally (no cloud credentials required) and verify it:

```bash
pnpm demo:local            # set up, verify, tear down
pnpm demo:local:keep       # leave it running at http://127.0.0.1:5173
```

The local demo only touches a database whose name ends in `_demo`.

## 8. Health checks and post-deploy verification

| Check               | Command / URL                          | Expected                          |
| ------------------- | -------------------------------------- | --------------------------------- |
| Liveness + adapters | `GET /health`                          | `status: ok`, `simulation: true`  |
| Readiness (DB)      | `GET /ready`                           | `status: ready`, `database: true` |
| Demo smoke          | `node deploy/verify-demo.mjs <origin>` | `failed: 0`                       |
| End-to-end journeys | `pnpm test:journey`                    | all journey tasks pass            |
| Config preflight    | `APP_ENV=production pnpm deploy:check` | exits 0                           |

Use `/health` for liveness and `/ready` for load-balancer/monitor readiness (it
pings the database and returns `503` when the database is unreachable).

## 9. CI/CD

`.github/workflows/ci.yml` runs format, lint, typecheck, unit tests,
migrations, and the database integration suites on every change. A deploy is
gated on CI passing. Extend CI with a deploy job only after the required
deployment secrets are configured in the repository.

## 10. Rollback

See [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md). In short: redeploy the
previous Vercel build and, if the schema changed, restore the pre-migration
backup. Edge Middleware and the function deploy independently, so a bad
frontend build can be reverted without touching the backend.
