# Neon development backend

The API can run as a Neon Function while Vite serves the frontend locally. The existing Fastify routes, Drizzle migrations, session handling, and sandbox adapters are reused. Neon hosts the database and API; it does not host this frontend.

## Configuration

- `neon.ts` declares the `healthwallet` function.
- `apps/api/src/neon.ts` initializes the database pool and exports the Fetch handler.
- `apps/api/src/neon-handler.ts` authenticates the frontend proxy before forwarding requests into Fastify.
- `apps/web/vite.config.ts` proxies `/api`, `/health`, and `/ready` to `NEON_FUNCTION_URL` when configured.
- Migrations prefer `DATABASE_URL_UNPOOLED`; application traffic uses `DATABASE_URL`.

Keep `ORIGIN_SECRET` and `NEON_FUNCTION_URL` in the root `.env.local`. The secret must contain at least 32 random characters and must also be supplied to the deployed function. Never prefix it with `VITE_`: it is for the server proxy only, not the browser bundle. Browser session cookies continue to work through the same-origin Vite proxy.

Keep Neon connection strings in `apps/api/.env`. Neon injects its own database connection strings into the deployed function. Do not deploy the local `.env` or manually upload `DATABASE_URL` as a function secret.

## Deployment sequence

1. Authenticate the Neon CLI and select the intended project and a development branch in a Functions-supported region.
2. Link this workspace without overwriting app environment files.
3. Pull that branch's connection strings into the API environment and apply `pnpm db:migrate` using the direct connection.
4. Build the shared package, review the Neon configuration plan, and deploy with `neon deploy --env .env.local`.
5. Retrieve the deployed function's invocation URL and save it as `NEON_FUNCTION_URL` in the root `.env.local`.
6. Start `pnpm dev:web`. Do not start the local API when using the Neon-hosted API.
7. Check `/health`, `/ready`, sandbox extraction, and the account flow through `http://localhost:5173`.

The native Function URL requires the server-only origin secret. An unauthenticated direct request should return 401; test readiness through the local proxy.

The current application is a sandbox. The local storage adapter uses temporary function storage for the extraction demonstration; files are not durable across function instances. Document upload/download routes enforce authorization, but production rejects local storage until a durable private adapter is configured. Phone delivery remains simulated in development; the configurable Twilio adapter requires credentials before it can establish phone ownership. Production rejects sandbox challenges and sessions. See [Authorization](AUTHORIZATION.md).

## Current setup status

Deployed and verified on 2026-10-11 through the connected Neon tools:

- Project: `healthwallet-liberia` (`twilight-grass-85761536`), AWS US East 1.
- Branch: `development` (`br-calm-queen-b8ri1sr5`).
- Databases: `healthwallet_dev` and isolated `healthwallet_test`.
- Backend: `https://br-calm-queen-b8ri1sr5-healthwallet.compute.c-14.us-east-1.aws.neon.tech/`.
- Local frontend: `http://127.0.0.1:5173` (restart with `pnpm dev:web`).

The development migrations have run. Health and database readiness return 200. HTTP checks through the frontend proxy verified simulation-code issuance, sign-in, cookie-based session restoration, consent withdrawal, sandbox extraction, logout, and rejection of the revoked session. The smoke test created a fictional +999 account; no real patient information was used.

The CLI's saved OAuth login is still expired; deployment used the authenticated Neon connector. To use CLI deployments later, run `neon auth --profile DEFAULT`, then link project `twilight-grass-85761536` and branch `development` with `--no-env-pull`. Keep the existing `.env.local` origin secret. Do not recreate the project.

The requested custom suspend interval was unavailable on this account. The project uses the account's default suspension settings and a fixed 0.25 CU compute limit.

## Verification results

The authorization suite runs against the isolated `healthwallet_test` database using `node apps/api/scripts/run-security-tests.mjs`. It covers customer and organization isolation, protected downloads, scoped caregiver permissions, contributor privacy, invitation misuse, MFA, recovery, suspension, and revocation, in addition to concurrent identity operations. Migrations `0002` and `0003` add the security schema and organization constraints.

## Authorization deployment — 2026-10-11

Neon Function deployment 2 is active. Both development and test databases have migrations through `0003`. The normal frontend is running at `http://127.0.0.1:5173`; the synthetic demo deployment is running at `http://127.0.0.1:5174`. The Account Security page is `/account/security`.

Verification passed: formatting, lint, TypeScript, production builds, 52 local tests, and 14 database integration tests (the initial 13 plus a focused administrator lifecycle test). Deployed HTTP smoke checks verified both proxies, database readiness, anonymous rejection, customer-only registration, persisted profile changes, administrator denial, MFA enrollment/verification, and rejection after session revocation. Only fictional accounts were used.

The local workstation clock differed from the deployed server clock during the smoke test. MFA verification passed using the server response time; authenticator devices must use automatic date/time. No server acceptance window was relaxed.

Live SMS credentials and durable private document storage remain unconfigured. No first PlatformAdmin was provisioned; use the explicit operator bootstrap documented in `AUTHORIZATION.md` for a selected enrolled account.

## Private storage preparation

A private Neon bucket and storage-scoped credential have been provisioned and verified with a synthetic object round trip and anonymous access denial. The S3 adapter passes its size-limit and access tests. Deploying this update is pending explicit approval to transfer the server-only secrets, as required by automatic approval review. The active function still uses temporary storage. See [Production setup](PRODUCTION_SETUP.md).

## Core ledger deployment — 2026-10-11

Function deployment 3 is active with the existing environment. Migration `0004_cheerful_ikaris` is applied to development and the isolated test database. The idempotent core seed is installed in development. It includes fictional users, institutions, care/review/payment records, six LRD funding sources, a separate USD wallet, and available/reserved/pending/restricted balances. No real payment or settlement is asserted.

The seeded customer is `+999700000001`; use the clearly labeled development code flow at `/account`, then open `/`. The customer home reads `/api/wallet`. The test login sessions have been revoked. The seed creates no usable session or PlatformAdmin.

Fourteen ledger integration tests passed on Neon, covering exact money, retry and spending concurrency, balancing/immutability, restrictions, reversals, captures/releases, explicit conversions, reconciliation, and wallet API ownership. Deployed HTTP checks confirmed exact balances, six sources, separate currencies, anonymous denial, cross-account isolation, and logout revocation. See [Core data model](CORE_DATA_MODEL.md).

Final core validation: 59 local tests passed, all 14 ledger integration scenarios passed, and four authorization regression scenarios passed against the new schema. Type checks, lint, builds and formatting passed. The timed-out first test run left a disposable schema, which was verified as synthetic and removed.

## Healthcare funding update

Migration `0005_messy_bromley` is applied to development. Function deployment **4** is active, with the existing environment inherited. New customer saving goals, support links, quotes, authorization, contribution history and receipts use the Neon API and PostgreSQL ledger. `/save`, `/support`, `/contribute#<token>` and `/history` are connected; Home displays real funding records from the development database.

Payment processing remains explicitly simulated. Production rejects sandbox funding, and no live payment provider or AI savings provider has been activated. Savings guidance currently uses a consented, explained planning calculation. See [Funding workflows](FUNDING_WORKFLOWS.md) for the API lifecycle, security boundaries and live-provider integration requirements.

Validation: nine funding integration scenarios passed against isolated Neon test schemas. A focused rerun also verified immutable funding event history and confirmed-payment records. The local suite now has 60 passing tests (39 API, 19 web, two shared); migration consistency, type checking, lint and builds passed.

The deployed browser smoke check passed at 360px mobile and 1280px desktop widths: goal creation, deposit fee review and authorization, pending status, simulated confirmation and receipt, public support lookup, contributor authorization, duplicate confirmation replay and exact beneficiary credit. Neither layout had horizontal overflow. Synthetic browser accounts `+999710000001` and `+999710000002` retain their test goals and simulated funding history; their test sessions were logged out. Screenshots are in `/tmp/lux-funding-mobile-review.png`, `/tmp/lux-funding-mobile-contributor.png` and `/tmp/lux-funding-desktop-history.png`.

## Provider portal update — 2026-10-12

Migration `0006_mighty_mariko_yashida` is applied to development and Neon Function deployment **5** is active. `/institutional/provider`, `/institutional/provider-verification` and the non-demo `/pay` now use the provider API. The deployment inherited its existing environment; no additional secrets were uploaded.

Seven provider database scenarios passed in isolated Neon schemas: independent verification, customer association and isolation, exact totals, immutable amendments and revision-bound evidence, suspended-provider payment blocking, disputes/corrections, MFA/revocation, and concurrent amendments/customer intake (some scenarios cover several boundaries). The original six ran together; the added concurrency scenario passed separately. The 63 local tests passed across the main run and a focused rerun of the 20 authentication tests after two five-second timeouts. Lint, type checking, builds and formatting passed. The responsive browser check passed at 360px and 1280px against the built frontend: provider and customer pages loaded without horizontal overflow, and provider QR generation worked. Initial attempts encountered an unresponsive old Chrome tab and development navigation timeouts; the successful run used a fresh headless browser and Vite preview. The opt-in harness uses `PROVIDER_BROWSER_TESTS=1`, test Chrome on port 9224 and the built frontend preview on port 5175. Screenshots are `/tmp/lux-provider-360.png` and `/tmp/lux-provider-1280.png`. Two additional authorization regression scenarios passed for cross-customer records/downloads and contributor medical-document isolation.

Deployed HTTP checks passed through port 5173: Neon readiness, anonymous rejection, customer directory and bill list access, denial of provider review privileges to a customer, and logout. Fictional customer `+999710000003` was used and its session revoked. No provider or administrator privileges were provisioned in development for these tests.

See [Provider portal](PROVIDER_PORTAL.md) for workflows and constraints. Durable document storage, live SMS/payment adapters, initial administrator provisioning and operational dispute resolution remain production setup tasks. Development uploads are temporary; do not use real medical documents.
