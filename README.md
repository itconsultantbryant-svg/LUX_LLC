# LUX HealthPay

Hosted synthetic demo: **https://luxllc.vercel.app**. No real funds move. See the [PRD](docs/PRD.md), [capability boundaries](docs/capabilities.md), [image provenance](docs/assets.md) and [deployment guide](docs/deployment-guide.md). Hosted account passwords are generated uniquely and handed off privately, never committed.

A new TypeScript modular monolith for structured healthcare claims in Liberia: a patient-first public website, invitation-based organization workspaces, insurer review, exact fee accounting, payment evidence and reconciliation. **This is a runnable synthetic pilot implementation, not an approved live Orange Money integration.** No patient wallets, custodial balances, tokens or subscriptions.

## Run locally

Requires Node 24, pnpm 11, PostgreSQL 15+ (Neon supported). S3-compatible private storage and ClamAV are required for usable attachments, not for the synthetic claim journey. Docker Compose supplies PostgreSQL, MinIO and ClamAV. Durable jobs use PostgreSQL `SKIP LOCKED`; Redis is intentionally not required.

```sh
pnpm install --frozen-lockfile
docker compose up -d
cp .env.example .env
```

Set these values in the ignored root `.env`:

| Name               | Local value / requirement                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL       | `postgresql://lux:local-development-only@localhost:5432/lux` for Compose; use a NEW database/Neon branch                                                               |
| BETTER_AUTH_SECRET | Your own high-entropy secret, at least 32 characters                                                                                                                   |
| BETTER_AUTH_URL    | `http://localhost:3000`                                                                                                                                                |
| WEB_ORIGIN         | `http://localhost:3000`                                                                                                                                                |
| LUX_MODE           | `demo` for local synthetic use                                                                                                                                         |
| ALLOW_DEMO_SEED    | `true` locally only                                                                                                                                                    |
| DEMO_PASSWORD      | Local demo password, at least 11 characters. The seed defaults to `LuxTest231@` for the synthetic demo; hosted demos may use a private DEMO_PASSWORDS_FILE map instead |

```sh
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000>. API: <http://localhost:4000/api/v1/health>. OpenAPI: <http://localhost:4000/api/v1/openapi.json>. Start commands must inherit the root environment; `pnpm dev` loads it for API/worker through dotenv. Set `API_INTERNAL_URL` in `apps/web/.env.local` or the Vercel environment when the API is not at `http://127.0.0.1:4000`.

The synthetic seed creates exactly three demonstration logins. Each combines every role for its organization so the dashboard and sidebar expose the full workflow without switching accounts:

- `facility@demo.lux.test`: facility claims, administration, finance and clinician roles.
- `insurer@demo.lux.test`: insurer administration, review, finance and audit roles.
- `admin@demo.lux.test`: LUX platform administration, LUX finance, support and Orange observer roles.

The local demo seed defaults to `LuxTest231@` when `DEMO_PASSWORD` is unset; set a different 11+ character value for any non-public demo. Hosted demos may instead supply `DEMO_PASSWORDS_FILE`, a private JSON map of account keys to unique passwords. The seed also creates an internal checker identity with no auth account, used only to attribute historical and demo checker steps; it is not a fourth login.

Each account uses a real Better Auth session cookie. No role selector or public signup grants access. Production still requires separate human maker and checker accounts: the demo-only self-check path is gated by `demoSelfCheck` and records a `DemoCheckerSubstitution` audit event. Without that explicit flag, the API returns `SEPARATE_CHECKER_REQUIRED`.

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
- Five supplied team portraits are used. Three supplied concept images serve as page heroes and content imagery, with hashes and focal-point metadata in `assets/illustrations/manifest.json` and public provenance at `/media/illustrations/credits.json`. Public pages use production-facing copy without synthetic labels, image captions or footer disclaimers. Authorized Orange marks and model-released product photography are not present; final operator approval remains an asset handoff item.
- Public legal text is explicitly an operator-review draft.
- No commit, push, deployment, hosted database reset or live transfer has been performed.

See [architecture](docs/system-architecture.md), [decision log](docs/decisions.md), [deployment](docs/deployment-guide.md), [security](docs/security.md), [payment runbook](docs/payments.md), [capability matrix](docs/capabilities.md), and [verification results](docs/test-results.md).
