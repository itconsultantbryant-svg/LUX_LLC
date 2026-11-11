# LUX HealthPay

Hosted synthetic demo: **https://luxllc.vercel.app**. No real funds move. See the [PRD](docs/PRD.md), [capability boundaries](docs/capabilities.md), [photography credits](docs/photography.md) and [deployment guide](docs/deployment-guide.md). Hosted account passwords are generated uniquely and handed off privately, never committed.

A new TypeScript modular monolith for structured healthcare claims in Liberia: public website, invitation-based organization workspaces, insurer review, exact fee accounting, payment evidence and reconciliation. **This is a runnable synthetic pilot implementation, not an approved live Orange Money integration.** No patient wallets, custodial balances, tokens or subscriptions.

## Run locally

Requires Node 24, pnpm 11, PostgreSQL 15+ (Neon supported). S3-compatible private storage and ClamAV are required for usable attachments, not for the synthetic claim journey. Docker Compose supplies PostgreSQL, MinIO and ClamAV. Durable jobs use PostgreSQL `SKIP LOCKED`; Redis is intentionally not required.

```sh
pnpm install --frozen-lockfile
docker compose up -d
cp .env.example .env
```

Set these values in the ignored root `.env`:

| Name               | Local value / requirement                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| DATABASE_URL       | `postgresql://lux:local-development-only@localhost:5432/lux` for Compose; use a NEW database/Neon branch |
| BETTER_AUTH_SECRET | Your own high-entropy secret, at least 32 characters                                                     |
| BETTER_AUTH_URL    | `http://localhost:3000`                                                                                  |
| WEB_ORIGIN         | `http://localhost:3000`                                                                                  |
| LUX_MODE           | `demo` for local synthetic use                                                                           |
| ALLOW_DEMO_SEED    | `true` locally only                                                                                      |
| DEMO_PASSWORD      | Your own local-only password, at least 16 characters; hosted demos use a private DEMO_PASSWORDS_FILE map |

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000>. API: <http://localhost:4000/api/v1/health>. OpenAPI: <http://localhost:4000/api/v1/openapi.json>. Start commands must inherit the root environment; `pnpm dev` loads it for API/worker through dotenv. Set `API_INTERNAL_URL` in `apps/web/.env.local` or the Vercel environment when the API is not at `http://127.0.0.1:4000`.

The seed prints account names, **not passwords**. Use your supplied local `DEMO_PASSWORD`, or set `DEMO_PASSWORDS_FILE` to a private JSON map of account keys to unique passwords for hosted demo use:

- `platform@demo.lux.test`: operations/CMS; no clinical access.
- `luxfinance@demo.lux.test`: LUX fee revenue.
- `facility@demo.lux.test`: explicitly combined synthetic facility clinician, claims, administration and finance roles.
- `facility2@demo.lux.test`: unrelated facility for access-denial tests.
- `reviewer@demo.lux.test`: insurer human decisions.
- `finance@demo.lux.test`: insurer payment maker/executor.
- `checker@demo.lux.test`: independent insurer payment checker.
- `insurer2@demo.lux.test`: unrelated insurer.

Each account uses a real Better Auth session cookie. No role selector or public signup grants access. Switching maker/checker requires signing out and using the other account (or separate browser profiles).

## Verify

Create a **separate empty PostgreSQL database**, set `TEST_DATABASE_URL` to it, then:

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
```

Integration tests migrate and seed the isolated test database only. They refuse the application database and never truncate data. Repeated test runs add synthetic records. Browser tests need the running API/web and local seed password. `BROWSER_EXECUTABLE` optionally selects an existing compatible Chromium on older development systems.

## Important boundaries

- Never point these **new foundation migrations** at the old LUX database. Use a new Neon branch/database; historical tables are not migrated or dropped.
- Production refuses `LUX_MODE=demo`; sandbox/live payment execution remains blocked, not faked.
- The seed’s insurer-added fee mode is synthetic only. Commercial fee incidence remains unresolved for live use.
- The supplied `LUX_HealthPay.png` actually contains historical **LUX AI** artwork. It is unchanged and accompanied by accessible **LUX HealthPay** text.
- Five supplied team portraits are used. No service photographs or authorized Orange marks were supplied. The hero uses a UI workflow diagram; photography integration remains an asset handoff item.
- Public legal text is explicitly an operator-review draft.
- No commit, push, deployment, hosted database reset or live transfer has been performed.

See [architecture](docs/system-architecture.md), [decision log](docs/decisions.md), [deployment](docs/deployment-guide.md), [security](docs/security.md), [payment runbook](docs/payments.md), [capability matrix](docs/capabilities.md), and [verification results](docs/test-results.md).
