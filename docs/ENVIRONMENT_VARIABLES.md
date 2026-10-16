# Environment variable reference

Every variable the platform reads, what it does, and where it is set. Values
shown are examples only. **Never commit real secrets.** Configure secrets in the
Vercel project settings; keep local secrets in the gitignored `.env.local` /
`apps/api/.env`.

The API validates this schema at startup (`apps/api/src/config/env.ts`) and
refuses to boot on an invalid value. `APP_ENV=production` adds the extra
requirements marked **Prod** below.

## Backend — `api` service

Set these on the Vercel project (scope: server). The `api` service runs the
Fastify app from `apps/api`.

| Variable                        | Required  | Default                 | Meaning                                                                               |
| ------------------------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `APP_ENV`                       | no        | `development`           | `development` \| `test` \| `demo` \| `production`. Drives simulation labels + guards. |
| `PORT`                          | no        | `4000`                  | HTTP port (local/standalone runs).                                                    |
| `HOST`                          | no        | `0.0.0.0`               | Bind address.                                                                         |
| `DATABASE_URL`                  | yes       | —                       | Pooled Neon connection string used by the running API.                                |
| `DATABASE_URL_UNPOOLED`         | for DDL   | —                       | Direct connection used by migrations/backups.                                         |
| `CORS_ORIGIN`                   | no        | `http://localhost:5173` | Allowed web origin(s), comma-separated. Set to the public site origin in production.  |
| `AI_ADAPTER`                    | no        | `sandbox`               | `sandbox` \| `live`.                                                                  |
| `PAYMENT_ADAPTER`               | no        | `sandbox`               | `sandbox` \| `live`. **Prod:** `live` also requires partner credentials.              |
| `MESSAGING_ADAPTER`             | no        | `sandbox`               | `sandbox` \| `live`.                                                                  |
| `PHONE_VERIFICATION_PROVIDER`   | no        | `sandbox`               | `sandbox` \| `twilio`.                                                                |
| `TWILIO_ACCOUNT_SID`            | if twilio | —                       | `^AC[a-fA-F0-9]{32}$`.                                                                |
| `TWILIO_AUTH_TOKEN`             | if twilio | —                       | ≥ 20 characters.                                                                      |
| `TWILIO_FROM_NUMBER`            | if twilio | —                       | E.164, e.g. `+231...`.                                                                |
| `SECURITY_ENCRYPTION_KEY`       | prod\*    | —                       | Exactly 64 hex characters. Signs download links and encrypts secrets at rest.         |
| `DOWNLOAD_LINK_SECRET`          | prod\*    | falls back to key       | ≥ 16 characters. Signs actor-bound document download links.                           |
| `DOWNLOAD_LINK_TTL_SECONDS`     | no        | `120`                   | Link lifetime, 15–3600 seconds.                                                       |
| `PAYMENT_CALLBACK_SECRET`       | **Prod**  | —                       | ≥ 16 characters. Verifies provider callbacks. **Required in production.**             |
| `STORAGE_ADAPTER`               | no        | `local`                 | `local` \| `s3`.                                                                      |
| `STORAGE_LOCAL_ROOT`            | no        | `./storage`             | Local disk root when `STORAGE_ADAPTER=local`.                                         |
| `S3_ENDPOINT`                   | if s3     | —                       | HTTPS, no embedded credentials.                                                       |
| `S3_REGION`                     | if s3     | —                       | Bucket region.                                                                        |
| `S3_BUCKET`                     | if s3     | —                       | `^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`.                                                 |
| `S3_ACCESS_KEY_ID`              | if s3     | —                       | Bucket credential.                                                                    |
| `S3_SECRET_ACCESS_KEY`          | if s3     | —                       | Bucket credential.                                                                    |
| `DEFAULT_CURRENCY`              | no        | `LRD`                   | Exactly 3 characters.                                                                 |
| `LOG_LEVEL`                     | no        | `info`                  | `fatal`…`trace`.                                                                      |
| `RATE_LIMIT_MUTATIONS`          | no        | `600`                   | Max mutations per client IP per window.                                               |
| `RATE_LIMIT_WINDOW_SECONDS`     | no        | `900`                   | Rate-limit window.                                                                    |
| `RETENTION_SESSION_DAYS`        | no        | `30`                    | Expired-session retention.                                                            |
| `RETENTION_OTP_DAYS`            | no        | `2`                     | OTP challenge retention.                                                              |
| `RETENTION_IDENTITY_LIMIT_DAYS` | no        | `30`                    | Identity-attempt retention.                                                           |
| `RETENTION_AI_ARTIFACT_DAYS`    | no        | `365`                   | AI artifact retention.                                                                |
| `RETENTION_DOCUMENT_DAYS`       | no        | `365`                   | Document-bytes retention.                                                             |
| `RETENTION_AUDIT_DAYS`          | no        | `2555`                  | Audit-event retention (≥ 30).                                                         |
| `USSD_SANDBOX_ENABLED`          | no        | `false`                 | Enables the sandbox USSD menu.                                                        |
| `ORANGE_MONEY_CLIENT_ID`        | if live   | —                       | Presence gate for `PAYMENT_ADAPTER=live` in production.                               |

\* Production requires `DOWNLOAD_LINK_SECRET` **or** `SECURITY_ENCRYPTION_KEY`.

Production-only rules enforced by the schema:

- If `PAYMENT_ADAPTER=live`, partner credentials (e.g. `ORANGE_MONEY_CLIENT_ID`)
  must be present; otherwise startup fails.
- `PAYMENT_CALLBACK_SECRET` is mandatory.
- A download-link signing secret (`DOWNLOAD_LINK_SECRET` or
  `SECURITY_ENCRYPTION_KEY`) is mandatory.

## Backend — server-only proxy secret (legacy Neon Function path)

Only relevant if you keep the optional Neon Function backend
([NEON_DEVELOPMENT.md](./NEON_DEVELOPMENT.md)). The default Vercel services
deployment does not use a proxy and does not need these.

| Variable            | Required | Meaning                                                                         |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| `ORIGIN_SECRET`     | legacy   | ≥ 32 random characters. Shared by the proxy and the Neon Function. Server-only. |
| `NEON_FUNCTION_URL` | legacy   | The deployed Neon Function URL the proxy forwards to. Server-only.              |

These are read by the proxy configuration only. They are never sent to the
browser and are **not** prefixed with `VITE_`.

## Frontend — `web` service (build-time)

These are inlined into the browser bundle at build time. **Do not put secrets
here.**

| Variable            | Required | Default | Meaning                                                              |
| ------------------- | -------- | ------- | -------------------------------------------------------------------- |
| `VITE_APP_ENV`      | no       | —       | `demo` shows the simulation/demo label. Match the backend `APP_ENV`. |
| `VITE_API_BASE_URL` | no       | empty   | Empty means same-origin `/api`. Set only if the API is cross-origin. |
| `VITE_PRODUCT_NAME` | no       | —       | Optional display override.                                           |
| `VITE_AI_ENGINE`    | no       | —       | Optional display override.                                           |

## Environment files in the repo

| File                                          | Purpose                                           |
| --------------------------------------------- | ------------------------------------------------- |
| `apps/api/.env.example`                       | Local API defaults.                               |
| `apps/web/.env.example`                       | Local web defaults.                               |
| `config/environments/development.env.example` | Development reference.                            |
| `config/environments/demo.env.example`        | Demo reference (sandbox adapters).                |
| `config/environments/test.env.example`        | Test harness reference.                           |
| `config/environments/production.env.example`  | Production reference (no secrets).                |
| `deploy/demo.env.example`                     | Full demo deployment reference (Vercel services). |

## Validation

```bash
APP_ENV=production pnpm deploy:check /path/to/production.env.local   # offline preflight of a production config
```

The checker (`apps/api/scripts/check-production.mjs`) reports the exact missing
or invalid variables without printing secret values.
