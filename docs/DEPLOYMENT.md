# Deployment guide

How to build, deploy, and verify HealthWallet Liberia. One Vercel project hosts
two [services](https://vercel.com/docs/services): the `web` frontend (static Vite
build) and the `api` backend (Fastify), backed by Neon PostgreSQL. Everything
here is repeatable and safe to run by hand; the same commands run in CI.

> **First read:** [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) (required inputs
> and activation sequence) and [NEON_DEVELOPMENT.md](./NEON_DEVELOPMENT.md) (Neon
> project identifiers). This guide is the operational companion to those.

## 1. Architecture at a glance

```
Browser
  │  same-origin HTTPS
  ▼
Vercel project (root vercel.json = services)
  ├─ /api/*, /health, /ready ─▶ api service  (apps/api, Fastify)  ──▶ Neon PostgreSQL
  │                                │  session cookies, CSRF + origin checks  (DATABASE_URL, pooled)
  └─ everything else ─────────▶ web service (apps/web, static Vite)
```

- The browser only ever talks to the Vercel origin (same-origin `/api/*`), so
  there is no CORS surface in production and no shared secret reaches the
  browser.
- The `api` service is public **only** on `/api/*`, `/health`, and `/ready`, via
  the top-level rewrites. It is otherwise unreachable from the internet.
- The API is stateless; all durable state is in Neon. Sessions are cookies
  scoped to the Vercel domain.
- Background work (reconciliation, retention) is **not** part of the request
  path; it runs on a schedule (see [MONITORING.md](./MONITORING.md)).

Configuration lives at the Vercel **project root** (Root Directory = repository
root):

| File          | Purpose                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| `vercel.json` | Declares the `api` and `web` services, public rewrites, SPA fallback, and security headers |

The API is a standard Fastify server (`apps/api/src/index.ts`). Vercel runs it as
a Function on Fluid compute, so there is no proxy and no `ORIGIN_SECRET`: the
top-level rewrites route requests to it, and the app's own session cookies, CSRF,
and origin checks protect it.

## 2. Prerequisites

- Node 24 (see `.nvmrc`) and pnpm 11.
- A Vercel account (connect your Git provider, or use the `vercel` CLI).
- Access to the Neon project that hosts the production database.

## 3. Environment variables

Full reference: [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). Summary:

- **`api` service (backend):** `APP_ENV`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `CORS_ORIGIN` (the public site origin), adapter selectors (`AI_ADAPTER`,
  `PAYMENT_ADAPTER`, `MESSAGING_ADAPTER`, `PHONE_VERIFICATION_PROVIDER`,
  `STORAGE_ADAPTER`), `SECURITY_ENCRYPTION_KEY`, `PAYMENT_CALLBACK_SECRET`, and
  the `S3_*` storage values.
- **`web` service (frontend, build-time):** `VITE_APP_ENV` (e.g. `demo`), and
  optional `VITE_API_BASE_URL` (leave empty for same-origin `/api`).

Set these on the Vercel project (Settings → Environment Variables); both services
share the project's variables. Never prefix a secret with `VITE_` — `VITE_*`
values are embedded in the browser bundle.

## 4. Prepare the backend (`api` service)

The `api` service is the Fastify app in `apps/api`. Vercel bundles
`apps/api/src/index.ts` (declared as the service `entrypoint`) as a single
Function on Fluid compute; the `@healthwallet/shared` workspace package is built
during the service's `installCommand`. There is no separate backend deploy step
and no function URL to capture.

> **Entrypoint note:** the service sets `entrypoint` explicitly. Vercel's Fastify
> auto-detection would otherwise select `apps/api/src/app.ts` (the `buildApp`
> factory, which imports `fastify` but never listens) ahead of `src/index.ts`,
> producing `FUNCTION_INVOCATION_FAILED` on every route.

Before the first `api` deploy, apply migrations to the production database (§6)
using the **unpooled** connection string:

```bash
APP_ENV=production DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" pnpm db:migrate
```

Then run the offline preflight:

```bash
APP_ENV=production pnpm deploy:check /path/to/production.env.local   # offline; validates production requirements
```

> `deploy:check` still requires `ORIGIN_SECRET`, which is only used by the
> optional Neon Function backend ([NEON_DEVELOPMENT.md](./NEON_DEVELOPMENT.md)).
> The default Vercel services deployment does not use it; set a placeholder value
> for the preflight or drop the requirement when you retire the Neon path.

## 5. Deploy on Vercel (services)

Vercel deploys the whole repository as a single project with two services
(declared in `vercel.json`):

| Service | Root       | Framework | Public paths                  | Notes                                                       |
| ------- | ---------- | --------- | ----------------------------- | ----------------------------------------------------------- |
| `api`   | `apps/api` | Fastify   | `/api/*`, `/health`, `/ready` | Runs `apps/api/src/index.ts` as a Function on Fluid compute |
| `web`   | `apps/web` | Vite      | everything else (`/`)         | Static build to `apps/web/dist`, SPA fallback               |

Vercel project settings:

- **Root Directory:** repository root (so `vercel.json` and both services are
  detected).
- Each service declares its own build/runtime settings in `vercel.json`; in
  services mode there is no top-level build config. The `api` service builds
  `@healthwallet/shared` in its `installCommand` and lets Vercel bundle the
  `src/index.ts` entrypoint; the `web` service uses the Vite defaults
  (`outputDirectory: dist`).

Environment variables (Vercel project → Settings → Environment Variables):

| Name                      | Scope  | Value                                             |
| ------------------------- | ------ | ------------------------------------------------- |
| `VITE_APP_ENV`            | Build  | `demo` (labels the deployment as a simulation)    |
| `VITE_API_BASE_URL`       | Build  | empty (same-origin `/api`)                        |
| `DATABASE_URL`            | Server | pooled Neon connection string (`sslmode=require`) |
| `CORS_ORIGIN`             | Server | the public site origin (e.g. `https://<domain>`)  |
| `SECURITY_ENCRYPTION_KEY` | Server | 64 hex characters (stable; see §3)                |
| `PAYMENT_CALLBACK_SECRET` | Server | ≥ 16 characters                                   |
| `S3_*`                    | Server | private bucket storage values                     |

Deploy by pushing to the connected branch, or:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

`vercel dev` runs both services together locally with the service routing
applied, so it is the closest local match to production. The Vite dev proxy in
`apps/web/vite.config.ts` remains for `pnpm dev` against a locally running API.

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
3. Set `VITE_APP_ENV=demo` (and the demo `DATABASE_URL`/`CORS_ORIGIN`) on the
   Vercel project and deploy; both services ship together.
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

| Check               | Command / URL                                     | Expected                          |
| ------------------- | ------------------------------------------------- | --------------------------------- |
| Liveness + adapters | `GET /health`                                     | `status: ok`, `simulation: true`  |
| Readiness (DB)      | `GET /ready`                                      | `status: ready`, `database: true` |
| Demo smoke          | `node deploy/verify-demo.mjs <origin>`            | `failed: 0`                       |
| End-to-end journeys | `pnpm test:journey`                               | all journey tasks pass            |
| Config preflight    | `APP_ENV=production pnpm deploy:check <env-file>` | exits 0                           |

Use `/health` for liveness and `/ready` for load-balancer/monitor readiness (it
pings the database and returns `503` when the database is unreachable).

## 9. CI/CD

`.github/workflows/ci.yml` runs format, lint, typecheck, unit tests,
migrations, and the database integration suites on every change. A deploy is
gated on CI passing. Extend CI with a deploy job only after the required
deployment secrets are configured in the repository.

## 10. Rollback

See [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md). In short: redeploy the
previous Vercel deployment and, if the schema changed, restore the pre-migration
backup. Both services ship in one deployment, so a rollback reverts the frontend
and backend together; an additive, backward-compatible migration may not need a
restore.
