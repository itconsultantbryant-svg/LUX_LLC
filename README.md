# HealthWallet Liberia

Healthcare-financing platform for the Orange Summer Challenge, powered by **LUX HealthTrust**, operated by **LUX AI**. Intended integration partner: **Orange Liberia** (no signed agreement implied).

## What this repo contains

- Product foundation docs in [`docs/`](./docs/)
- Modular monorepo:
  - `apps/web` — React + TypeScript (Vite), mobile-first UI
  - `apps/api` — Node.js + Fastify + PostgreSQL (Drizzle)
  - `packages/shared` — shared Zod contracts and product constants
  - `packages/config` — shared tooling baselines
- Sandbox adapters for AI, payments, messaging, and local document storage
- CI workflow for format, lint, typecheck, test, migrate, build, and readiness

## Prerequisites

- Node.js 24+ (`nvm use` selects the project version)
- [pnpm](https://pnpm.io/) 11+
- PostgreSQL 15+ (Docker Compose provided, or local install)

## Quick start

### 1. Install dependencies

```bash
nvm use
pnpm install
```

### 2. Start PostgreSQL

Option A — Docker:

```bash
docker compose up -d postgres
```

Option B — local Postgres: create role/database matching the URL below.

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Default database URL:

`postgresql://healthwallet:healthwallet@127.0.0.1:5432/healthwallet_dev`

Environment samples: [`config/environments/`](./config/environments/).

### 4. Migrate and run

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- Sandbox account: http://localhost:5173/account
- API health: http://localhost:4000/health
- API ready (DB): http://localhost:4000/ready

`pnpm db:seed` creates synthetic records and the development portal accounts shown
on the sign-in screen. It is restricted to development, demo, and test databases.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# or everything:
pnpm check
```

## Demo and deployment

```bash
pnpm demo:local          # labelled synthetic demo, set up + verify + tear down
pnpm demo:local:keep     # leave it running at http://127.0.0.1:5173
pnpm deploy:check        # offline production configuration preflight
```

See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and
[docs/FIVE_MINUTE_DEMO.md](./docs/FIVE_MINUTE_DEMO.md).

## Documentation map

| Document                   | Path                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Product requirements       | [docs/PRODUCT_REQUIREMENTS.md](./docs/PRODUCT_REQUIREMENTS.md)                               |
| Roles & permissions        | [docs/ROLE_PERMISSION_MATRIX.md](./docs/ROLE_PERMISSION_MATRIX.md)                           |
| Screen inventory           | [docs/SCREEN_INVENTORY.md](./docs/SCREEN_INVENTORY.md)                                       |
| Architecture               | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)                                               |
| How AI is used             | [docs/AI_USAGE.md](./docs/AI_USAGE.md)                                                       |
| Implementation backlog     | [docs/IMPLEMENTATION_BACKLOG.md](./docs/IMPLEMENTATION_BACKLOG.md)                           |
| Assumptions & integrations | [docs/ASSUMPTIONS_AND_INTEGRATIONS.md](./docs/ASSUMPTIONS_AND_INTEGRATIONS.md)               |
| Payment journey acceptance | [docs/ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md](./docs/ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md) |
| Reusable components        | [docs/REUSABLE_COMPONENTS.md](./docs/REUSABLE_COMPONENTS.md)                                 |
| Deployment                 | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)                                                   |
| Environment variables      | [docs/ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md)                             |
| Migrations                 | [docs/MIGRATIONS.md](./docs/MIGRATIONS.md)                                                   |
| Monitoring                 | [docs/MONITORING.md](./docs/MONITORING.md)                                                   |
| Backup & rollback          | [docs/BACKUP_AND_ROLLBACK.md](./docs/BACKUP_AND_ROLLBACK.md)                                 |
| Incident response          | [docs/INCIDENT_RESPONSE.md](./docs/INCIDENT_RESPONSE.md)                                     |
| Administrator guide        | [docs/ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md)                                                 |
| Provider guide             | [docs/PROVIDER_GUIDE.md](./docs/PROVIDER_GUIDE.md)                                           |
| Customer support guide     | [docs/CUSTOMER_SUPPORT_GUIDE.md](./docs/CUSTOMER_SUPPORT_GUIDE.md)                           |
| Five-minute demo           | [docs/FIVE_MINUTE_DEMO.md](./docs/FIVE_MINUTE_DEMO.md)                                       |
| Pilot proposal             | [docs/PILOT_PROPOSAL.md](./docs/PILOT_PROPOSAL.md)                                           |
| Readiness & approvals      | [docs/READINESS_AND_APPROVALS.md](./docs/READINESS_AND_APPROVALS.md)                         |
| Operations runbook         | [docs/OPERATIONS_RUNBOOK.md](./docs/OPERATIONS_RUNBOOK.md)                                   |

## Adapter replacement points

| Concern                         | Sandbox default              | Replace when                        |
| ------------------------------- | ---------------------------- | ----------------------------------- |
| AI (`AI_ADAPTER`)               | `lux-healthtrust.ai.sandbox` | Live LUX HealthTrust model hosting  |
| Payments (`PAYMENT_ADAPTER`)    | Simulated Orange Money–style | Confirmed Orange Liberia interfaces |
| Messaging (`MESSAGING_ADAPTER`) | Log sink                     | Approved SMS/USSD/WhatsApp gateway  |
| Storage (`STORAGE_ADAPTER`)     | Local disk                   | Private object bucket               |

Demo/development/test must keep simulation labels visible. Do not invent accuracy or automation percentages.

## Unresolved partner questions

Recorded in the assumptions register, including: Orange’s 85–90% AI definition, Orange Money sandbox interfaces, fund custody, participating providers/sponsors, fees/limits, USSD availability, and AI evaluation data policy.

## Sandbox sign-in

The Account and Account Security pages support configurable phone verification, expiring and revocable sessions, authenticator MFA, recovery codes, profiles, consent, dependent access, invitations, and organization onboarding. Every implemented record and document API enforces server-side ownership or organization membership. See [Authorization](docs/AUTHORIZATION.md) for permissions, configuration, and administrator bootstrap. Development uses simulated phone codes; no SMS is sent until a live provider is configured. Use fictional information only. Production rejects simulated sessions.

See [development handoff](docs/DEVELOPMENT_HANDOFF.md) for implementation status, verification limits, and the next development steps.

## Current deployment setup

One Vercel project hosts the `web` frontend (static Vite build) and the `api`
backend (Fastify), backed by Neon PostgreSQL. See [Deployment](docs/DEPLOYMENT.md).
For local development, either run both apps with `pnpm dev` (local API), or point
the Vite dev proxy at a Neon Function using the server-only values in the root
`.env.local`:

```bash
pnpm dev:web
```

Open http://127.0.0.1:5173. See [Neon development](docs/NEON_DEVELOPMENT.md) for
the optional Neon Function workflow (a legacy alternative to the Vercel service).

### LUX brand and device support

The web app uses the supplied `assets/LUX_AI_logo.png` throughout, with LUX navy
(`#001539`) and orange (`#ff7900`). Its layouts support phones, tablets, and desktop
browsers, with bottom navigation on small screens and keyboard focus support.

Production builds include an installable web app manifest and a branded offline
notice. Installation requires HTTPS (or localhost) and browser support. Account
and API responses are never cached by the service worker; account actions require
internet access. This is a responsive web app, not an App Store/Play Store native
binary. Deploy on HTTPS as a Vercel project with the `web` and `api` services; the
browser only talks to the same origin, so no secret reaches the client. The local
development URL is only accessible on this computer by default.

For browser layout checks, start Chrome with `--headless
--remote-debugging-port=9223 --user-data-dir=/tmp/lux-browser-check`, start the web
server, then run `node apps/web/scripts/check-browser.mjs`. Screenshots are written
to `/tmp/lux-screenshots`. Set `APP_URL` to check another deployment.

## Core data model and ledger

The core model now includes a database-enforced double-entry ledger, exact money, source-specific allocation rules, idempotent funding/reservation/capture operations, explicit currency conversion records, and separate partner settlement tracking. The customer home reads the authenticated `/api/wallet` projection. See [Core data model](docs/CORE_DATA_MODEL.md) for migrations, synthetic seed data, accounting invariants, and test commands.

Healthcare deposits, support links, contribution receipts, and consented savings planning: [Funding workflows](docs/FUNDING_WORKFLOWS.md).
