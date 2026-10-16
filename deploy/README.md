# Deploy directory

Tools and references for deploying HealthWallet Liberia. The full procedure is
in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

| File               | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `demo.env.example` | Reference environment for a labelled demo deployment.            |
| `local-demo.sh`    | Set up, seed, run, and verify a labelled synthetic demo locally. |
| `verify-demo.mjs`  | Smoke-verify a running demo through its public origin.           |

The deploy configuration lives at the repository root so Vercel picks it up as a
single project with two [services](https://vercel.com/docs/services):

| File          | Purpose                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `vercel.json` | Vercel **services** config: `api` (Fastify, `apps/api`) and `web` (Vite, `apps/web`), public rewrites, SPA fallback, and security headers. |

## Local demo

`local-demo.sh` is repeatable and safe — it only touches a database whose name
ends in `_demo`, and it refuses otherwise.

```bash
pnpm demo:local          # set up, verify, tear down
pnpm demo:local:keep     # leave running at http://127.0.0.1:5173
```

It creates `healthwallet_demo`, migrates, seeds synthetic records, builds the
shared package and web app, starts the API (`APP_ENV=demo`, sandbox adapters) and
the web dev server (proxying to the local API, ignoring the root `.env.local`),
then runs `verify-demo.mjs`.

## Verify a deployed demo

```bash
node deploy/verify-demo.mjs https://YOUR-DEMO-ORIGIN
```

Checks, through the public origin: `/health` is `ok` and a simulation, every
adapter is `sandbox`, `/ready` reports the database up, `/api/meta` and
`/api/fees` are served, and protected routes reject anonymous access. Exits
non-zero on any failure. Authenticated journeys are covered by
`pnpm test:journey`.
