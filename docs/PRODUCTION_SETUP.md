# Production setup

The running environment remains development until live phone verification, the production HTTPS origin, and an administrator identity are supplied. The development database, credentials, sandbox accounts, and authenticator keys must not be reused for production.

## Completed preparation

- Implemented private S3-compatible storage using the official AWS SDK, configured against Neon object storage.
- Created `healthwallet-documents` with private access on the existing development branch, with a credential limited to storage read/write.
- Downloads remain authenticated API streams. Direct signed URLs are disabled. Objects use opaque keys, bounded sizes, and private/no-store cache headers.
- Verified a real synthetic upload/download and anonymous denial; removed the verification object afterward.
- Added `apps/api/scripts/check-production.mjs` for a secret-safe configuration preflight.

## Deployment status

The tested bundle is prepared at `/tmp/lux-neon-security/function.zip`. Automatic approval review blocked transferring storage credentials and existing encryption/origin secrets to the existing Neon function, pending explicit user approval. The storage environment change was not applied. Subsequent ledger code deployment 3 inherited the existing environment. Local ignored environment files contain the new scoped storage credentials with owner-only filesystem permissions. The active function is deployment 3 with temporary storage.

## Required inputs

1. Production HTTPS domain/origin and frontend hosting destination.
2. Twilio account SID, auth token, and SMS-capable sender. Configure them through a secret manager or ignored `.env.production.local`, not chat. SMS delivery and account permissions for the destination country must be exercised with the intended owner.
3. The intended first administrator's account ID or phone number. That person must complete live phone verification and authenticator enrollment on production before bootstrap.

Copy `config/environments/production.env.example` into an ignored secret file and populate the production values. Use separate randomly generated `SECURITY_ENCRYPTION_KEY` and `ORIGIN_SECRET`; preserve the encryption key in the secret manager because rotating it without re-enrollment invalidates stored authenticators.

Production also **requires** `PAYMENT_CALLBACK_SECRET` (at least 16 characters; verifies provider callbacks) and either `DOWNLOAD_LINK_SECRET` or `SECURITY_ENCRYPTION_KEY` (signs short-lived document download links). The API refuses to boot in production without them. Optional hardening settings: `DOWNLOAD_LINK_TTL_SECONDS` (default 120), `RATE_LIMIT_MUTATIONS`/`RATE_LIMIT_WINDOW_SECONDS`, and the `RETENTION_*` windows. See `docs/SECURITY_HARDENING.md` and `docs/OPERATIONS_RUNBOOK.md`.

## Activation sequence

1. Provision a clean production Neon database/branch and private bucket. Apply migrations to the empty database; do not copy development users or documents. Issue a separate storage credential.
2. Run `node apps/api/scripts/check-production.mjs /absolute/path/.env.production.local`. This validates configuration without printing values; it is not a substitute for connectivity or delivery tests.
3. Deploy the backend with production settings. Neon supplies its database connection. Keep the origin secret and storage/SMS credentials server-only.
4. Deploy the web app with `VITE_APP_ENV=production`, same-origin `/api` routing, and a server proxy that overwrites the trusted client-IP header. HTTPS is required for secure session cookies. Do not enable the demo entry.
5. Verify live SMS sign-in, MFA, private document upload/download, anonymous/cross-account denial, recovery, and revocation through the production HTTPS origin.
6. The selected administrator enrolls MFA. Against the production database, run `node scripts/bootstrap-platform-admin.mjs <account-uuid>` from `apps/api` with `APP_ENV=production` and the production connection supplied by the operator. Bootstrap revokes sessions; sign in and verify MFA again.

Payment and AI adapters still use sandbox implementations. Completing identity/storage setup does not enable real healthcare payments or live AI processing.

## Storage operations

Run `node apps/api/scripts/check-private-storage.mjs` to exercise the configured private bucket with a disposable synthetic object. The script loads the API environment without overwriting explicitly injected variables. Rotate storage credentials by deploying the replacement before revoking the old credential. Existing local temporary uploads are not copied automatically.

The adapter uses the [official S3 SDK operations](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html); Neon provides the S3 endpoint and branch-scoped storage credentials. Bucket privacy must remain `private`.
