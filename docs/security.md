# Security, privacy, backup and incident operations

## Implemented controls

- Better Auth password hashing, HttpOnly session cookies, expiry, verified email, reset endpoints, TOTP challenge/recovery and lockout. Public signup is blocked at the API boundary; invitation tokens are random, hashed, expiring and one-use. No localStorage tokens.
- Same-origin frontend API proxy; explicit trusted origin; unsafe cross-origin requests rejected; Better Auth performs its own CSRF/origin checks. Do not disable these checks to bypass deployment misconfiguration.
- Every domain request queries active membership and organization state. Finance serializers exclude clinical detail. Platform administration does not silently bypass insurer authority.
- Privileged non-demo roles require MFA. High-risk authorization and destination operations require a session under ten minutes old and separate identities.
- Shared runtime input validation, parameterized SQL, server-computed integer money, immutable submissions/audit, optimistic version preconditions and canonical idempotency fingerprints.
- Signed private file links require authorized clinical scope and CLEAN scan state. Actual size and magic bytes are verified, ClamAV is required, and the exact scanned bytes are published under a different server-only object key. Quarantine URLs cannot overwrite published clean bytes.
- Public enquiry honeypot, consent and database-backed IP-hash hourly limits. External notifications omit clinical details. In-app messages are durable and idempotent.
- API error responses expose safe codes, field errors and a correlation ID—not stack traces. General request error logging is metadata-only. Never enable SQL parameter/body logging in production.

## Configuration and secret rotation

Server secrets: database connection, Better Auth secret, mail key and private S3 credentials. Never add them to `NEXT_PUBLIC_*`. Database SSL must use Neon’s verified TLS (`sslmode=require` using its official connection string); never set `rejectUnauthorized=false`.

Use separate migration-owner and limited application database roles. Review grants to prevent direct financial table updates outside the application. Enable managed encryption, restricted network access and private bucket policies. Disable bucket public listing/access; scope the S3 key to quarantine PUT and clean GET/PUT for server use. Configure frontend origin CORS on **quarantine PUT only**. Apply lifecycle cleanup to orphan quarantine objects.

Rotate database/S3/mail keys with overlapping credentials, update deployment secrets, verify health, then revoke old keys. Better Auth secret rotation requires its documented plural secret rotation mechanism and session strategy; do not change the secret blindly and assume existing encrypted TOTP data remains readable. Revoke sessions after suspected compromise. Record rotation without logging secret values.

## Backup / restore exercise

Use Neon PITR/branch retention according to an approved contract. Also keep encrypted logical exports and private-object backups where policy permits. Example commands use environment names, not committed secrets:

```sh
pg_dump --format=custom --file=lux-backup.dump "$DATABASE_URL"
pg_restore --no-owner --dbname="$RESTORE_DATABASE_URL" lux-backup.dump
```

Run restore only into a **new isolated database**. Verify schema migration checksums, organization/membership counts, immutable claim versions, ledger balances per currency, provider reference uniqueness and attachment hashes. Start an isolated nonfinancial validation process; never execute queued payments in a restored environment until provider state is reconciled. Document recovery point/time and evidence. Never run seed against production or restore over an active database.

An automated local restore exercise is provided by `scripts/restore-drill.ts` when a separate target is explicitly supplied. Production recovery-time objectives and retention periods require operator approval.

## Incident response

1. Triage metadata/correlation IDs. Do not paste raw medical records, credentials or prompts into tickets.
2. Contain: suspend affected memberships/organizations, stop payment dispatch, preserve database/object/audit evidence. Do not delete unknown payments or release their reservations.
3. Reconcile external provider outcomes before authorizing retries. Rotate compromised credentials and revoke sessions.
4. Notify authorized operator/privacy/legal contacts under the approved incident plan. Contact details and legal deadlines must be supplied by the operator; none are invented here.
5. Restore/test into an isolated environment if necessary. Compare external payment state before resuming dispatch.
6. Record timeline, scope, evidence, corrective actions and an independent approval to reopen financial processing.

Local tests exercise cross-organization denial, replay, concurrency and timeout handling. A local logical database restore into a new isolated database was exercised successfully; see `docs/test-results.md`. **No live-provider outage drill, object-store recovery drill or full organization incident-response tabletop has yet been completed.** Complete these with named operators before launch.

## Release gates

Approved privacy notice/processing basis/retention, penetration testing, dependency audit, threat review, live MFA enrollment and recovery exercise, storage/malware integration test, scoped support approval workflow, exact provider contracts/signatures, backup restoration drill and manual screen-reader review remain necessary. This implementation does not claim certification or blanket regulatory compliance.
