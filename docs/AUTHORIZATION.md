# Authentication and authorization

Authorization is enforced by the API, using PostgreSQL on Neon. Client navigation,
demo state, request bodies, role headers, and organization selectors are never
permission sources. The root API hook requires a valid session by default; only
phone verification/configuration, logout, and non-sensitive product metadata are
public. Every resource operation additionally checks ownership, an explicit care
grant, or active organization membership inside a database transaction.

## Authentication

`PHONE_VERIFICATION_PROVIDER=sandbox` uses fictional codes in non-production
only. `twilio` delivers server-generated SMS codes through the Twilio Messages API;
configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.
The delivery interface is replaceable through `MessagingAdapter`. Code verification
and limits are owned by this API, rather than Twilio Verify.

- Codes expire in five minutes and permit five verification attempts.
- Resend cooldown is one minute; issuance is limited to five per phone/hour and
  twenty per IP/hour. Verification is limited to sixty per IP/fifteen minutes.
- Codes are scrypt-hashed. Failed attempts commit, and row locks prevent reuse or
  concurrent double verification. Delivery failure invalidates the challenge.
- Only the sandbox provider returns a code in its API response. Challenge source
  is recorded: a sandbox challenge cannot be redeemed by a live provider.
- Sign-in assigns only Customer to a new account. Privileged roles are never
  accepted from registration input.
- Sessions use random 256-bit credentials, stored as SHA-256 hashes, with an
  eight-hour expiry. Cookies are HttpOnly, SameSite=Strict, and Secure in production.
- Logout revokes the current session; the security screen can revoke every session.
  Account suspension blocks existing and newly issued sessions.
- Production rejects sandbox authentication and previously issued sandbox sessions,
  irrespective of frontend flags or client claims.
- Mutations reject untrusted Origin and cross-site fetch metadata. Sensitive API
  responses and downloads use `Cache-Control: no-store`.

The authenticated frontend proxy overwrites `x-healthwallet-client-ip` from the
socket address. The Neon handler accepts it only after checking the server-only
origin secret and strips it before dispatch. Arbitrary `x-forwarded-*` headers are
ignored. A production frontend proxy must follow the same rule and must not expose
`ORIGIN_SECRET` to browsers. If no trusted client address is supplied, IP limits
conservatively apply to the shared gateway address.

## Institutional MFA and recovery

All institutional operations require recent MFA (fifteen minutes). Authenticator
secrets use AES-256-GCM encryption with user-ID binding. Configure a stable
`SECURITY_ENCRYPTION_KEY` containing 32 random bytes encoded as 64 hex characters;
keep it in a secret manager. Without it, enrollment/verification fails closed.

Authenticator codes follow [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238):
30-second steps, six digits, a one-step clock-skew window, and a persisted last-used
step to prevent replay. Enrollment expires after ten minutes. Verification and
recovery actions are limited to ten attempts per account per fifteen minutes,
across sessions; counters survive rejected transactions. The authenticator unit
suite includes the RFC SHA-1 reference vectors.

Eight high-entropy, single-use recovery codes can be generated after fresh phone
authentication (within ten minutes), plus MFA if already enrolled. Only their
hashes are stored; generating replacements revokes the old set.

For a lost phone number, sign in with the new number using a new account without
existing records. Present the previous phone and an unused recovery code. Recovery
moves the verified new number to the original account, consumes that code, revokes
both accounts' sessions and outstanding old-number invitations, and preserves the
original authenticator requirement. It never merges an established second
account's data. Losing an authenticator requires fresh phone authentication plus a
recovery code; reset revokes every session and requires enrollment again before
institutional access. There is no phone-only or support-agent recovery bypass.

## Permission matrix

| Role              | Authorized scope                                                           | Medical documents                                  |
| ----------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| Customer          | Own profile, consent, bills, and declared dependents                       | Own; explicitly granted dependent/caregiver scopes |
| Contributor       | Own contribution and permitted payment confirmation                        | None from contributing                             |
| ProviderStaff     | Bills associated with an active, approved provider organization membership | Same organization only, with MFA                   |
| ProviderManager   | Provider scope; invite/manage ProviderStaff in the same organization       | Same organization only, with MFA                   |
| OrganizationAdmin | Organization membership and invitation management                          | No automatic medical access                        |
| ProgramManager    | Organization-scoped financial bill summaries                               | No automatic medical access                        |
| Reviewer          | Organization-scoped financial review summaries                             | No automatic medical access                        |
| FinanceOperator   | Organization-scoped financial summaries                                    | No automatic medical access                        |
| PartnerOfficer    | Own organization's aggregate summary                                       | None                                               |
| PlatformAdmin     | Independent verification, suspension, global role administration           | No blanket medical-record access                   |

Organization roles live in `organization_memberships`, not `user_roles`.
Customer, Contributor, and PlatformAdmin are global roles. Legacy role enum values
remain for migration compatibility but do not confer organization permissions.
A provider/global role without a matching membership grants no tenant access.
For multiple memberships, permissions are evaluated against the requested
organization, never inferred from a role in another organization.

## Ownership, caregivers, and documents

A dependent is a new record owned by its declaring guardian; creating one never
links to an existing person's account. The guardian declaration is recorded, not
represented as independently verified legal guardianship.

Care authorizations identify an owner, a caregiver, an exact dependent (or the
owner's own records), permitted scopes, and expiry. Scopes are `records:read`,
`records:write`, `documents:read`, and `documents:write`. The UI defaults to read-only
records for thirty days and requires a separate document-access checkbox. A grant
for the owner's records does not include every dependent. Caregivers cannot
redelegate somebody else's authority. Owners or recipients can revoke a grant.

Bill creation derives ownership from the session or an explicit write grant.
Owners may associate a bill with an approved provider organization; provider
access is limited to that association. Updates cannot change ownership,
organization, or verification status. Only draft bills can be edited.

Documents are private objects, accessed through an authenticated download route.
Every download rechecks ownership/grant/organization scope; no storage keys or
reusable public URLs are returned. Responses force attachment download and
`nosniff`. Financial views omit medical fields. Contributor responses omit the
beneficiary's medical details and document keys even when payment is confirmed.

A private durable Neon S3-compatible bucket and adapter are configured locally. Activating durable storage on the Neon function is pending explicit approval for the server-secret transfer; the active backend still uses temporary local storage. Local storage remains available only for development; production document operations reject it. Downloads always stream through authorization checks, and no direct signed read URL is exposed. See [Production setup](PRODUCTION_SETUP.md) for production activation and separate credentials.

## Onboarding, invitations, suspension

Organization/provider applications start pending and grant no role. PlatformAdmin
reviews are recorded append-only; applicants cannot approve their own application.
Independent approval provisions the initial OrganizationAdmin membership.

OrganizationAdmin can invite appropriate roles for its organization type;
ProviderManager can invite only ProviderStaff. Invitation tokens are random,
hashed, expire after 72 hours, and can be accepted once by the matching verified
phone with MFA. Acceptance rechecks the issuer's current permissions. Revoked
issuers, organizations, invitations, and expired/reused tokens are rejected.

Membership changes revoke the affected user's sessions and outstanding relevant
invitations. Organization suspension invalidates member sessions and invitations.
Account suspension blocks all access; lifting it does not resurrect revoked sessions.
Verification status and review history are available to the subject or authorized
organization administrator. Administrative review never implies medical access.

The first PlatformAdmin is created only through the operator script:

```sh
cd apps/api
node scripts/bootstrap-platform-admin.mjs <existing-user-uuid>
```

It requires an active account with an enrolled authenticator and refuses to run if
an administrator already exists. No initial administrator is silently provisioned.
Later grants/revocations use the MFA-protected administration API, cannot target the
acting administrator, and revoke the target's sessions. New PlatformAdmins must
already have an authenticator enrolled.

## API surface

- `/api/auth/config`, `/request-code`, `/verify-code`, `/me`, `/consent`, `/logout`
  (the last five paths share the `/api/auth` prefix).
- `/api/security/session`, `/sessions/revoke`, `/mfa/enroll`, `/mfa/verify`,
  `/mfa/reset`, `/recovery-codes`, `/recover` (all under `/api/security`).
- `GET/PATCH /api/customers/me`; `GET /api/customers/:id/bills`.
- `POST/GET /api/dependents`; `GET /api/dependents/:id`.
- `POST/GET /api/care-authorizations`; `DELETE /api/care-authorizations/:id`.
- `POST/GET /api/organizations`; `GET /api/organizations/:id`.
- Organization-scoped `/members`, `/invitations`, `/bills`, `/summary`;
  `PATCH /api/organizations/:id/members/:membershipId`;
  `DELETE /api/organizations/:id/invitations/:invitationId`.
- `POST /api/invitations/accept`.
- `GET /api/admin/onboarding`; `POST /api/admin/organizations/:id/reviews`;
  `POST /api/admin/users/:id/reviews`; `PATCH /api/admin/users/:id/access`;
  `POST /api/admin/users/:id/roles`.
- `POST /api/bills`; `GET/PATCH /api/bills/:id`;
  `POST /api/bills/:id/documents`; `GET /api/documents/:id/download`.
- `GET /api/contributions` and `/api/contributions/:id` expose only the caller's
  records. Contribution settlement remains a separate payment-system operation.

## Verification and operation

Run `node apps/api/scripts/run-security-tests.mjs` from the repository root. It
migrates and tests only the existing isolated `healthwallet_test` database, requires
an explicit test environment internally, and removes the synthetic records it
creates. The tests exercise the real Fastify middleware, database transactions,
MFA, recovery, invitations, suspension, and private document streaming.

SMS credentials have not been supplied; the deployed development backend continues
using sandbox delivery. Live SMS delivery has not been exercised. Twilio request
shape follows the [official Messages API](https://www.twilio.com/docs/messaging/api/message-resource).
There is no native app credential storage in this implementation; browser sessions
remain HttpOnly cookies. Expired `identity_limits` rows may be deleted by scheduled
maintenance; audit and consent retention require an explicit deployment policy.
