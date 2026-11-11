# Typed API examples

OpenAPI is served at `/api/v1/openapi.json`; `packages/domain/index.ts` contains the runtime Zod input contracts. Auth API is `/api/auth/*` through Better Auth. Cookies, MFA and trusted origins are handled by the library. Public signup is disabled by the transport boundary.

```ts
type MinorUnits = string; // nonnegative decimal integer; never a float
type ClaimItem = {
  code: string;
  description: string;
  quantity: number;
  unitMinor: MinorUnits;
};
type Decision = {
  outcome: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "NEEDS_INFORMATION";
  reason: string;
  approvedMinor: MinorUnits;
};
type SafeError = {
  code: string;
  message: string;
  fieldErrors: Record<string, string[]>;
  correlationId: string;
};

// Browser: same-origin cookie, no localStorage tokens.
const response = await fetch(`/api/v1/claims/${syntheticClaimId}/decisions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Organization-ID": authorizedInsurerMembershipId,
    "If-Match": "3",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    outcome: "PARTIALLY_APPROVED",
    reason:
      "Synthetic reviewer reason: one item excluded under the pilot tariff.",
    approvedMinor: "70000",
  } satisfies Decision),
});
```

For a retry of the **same command**, reuse the same key and payload. A different payload under the same scoped key returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`. UI retries after a new user action generate new keys; financial state/version checks remain necessary.

Public enquiry:

```json
{
  "kind": "FACILITY",
  "organization": "Synthetic Clinic",
  "name": "Synthetic Contact",
  "email": "contact@example.test",
  "phone": "0770000000",
  "location": "Monrovia",
  "message": "We would like to discuss a synthetic organization pilot.",
  "consent": true,
  "website": ""
}
```

`POST /api/v1/public/enquiries` returns `RECORDED`, not “email sent,” and never an active organization. Authenticated LUX administration reviews `/admin/organization-requests` and explicitly approves a request with a reason.

## Important preconditions

| Command                               | Preconditions                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/claims/{id}/submit`                 | facility claims permission, related DRAFT, If-Match, idempotency key, positive server-computed bill, active contract, required CLEAN evidence                             |
| `/claims/{id}/decisions`              | matching insurer reviewer, AWAITING_REVIEW, If-Match/key, reason, valid payable amount; no conflicting allocations                                                        |
| `/claims/{id}/payment-authorizations` | insurer finance, fresh session, approved claim, If-Match/key, nonzero unreserved remainder, configured fee policy, verified destination; unsupported live/sandbox blocked |
| `/payments/{id}/approve`              | insurer finance, fresh session, different checker identity, If-Match/key                                                                                                  |
| `/payments/{id}/execute`              | insurer finance, fresh session, AUTHORIZED/AWAITING_FUNDS supported path, If-Match/key, declared demo capability; no ambiguous retry                                      |
| `/attachments/{id}/download`          | authorized clinical permission, related claim, CLEAN scan state; signed link lasts 60 seconds                                                                             |
| `/reconciliation/imports`             | reconciliation permission, schema-valid rows, staged preview; confirm creates checksummed run, not settlement                                                             |
| `/exports`                            | same report/organization authorization as screen; audited, CSV formula-safe                                                                                               |

The current claim list returns up to 50 summaries plus a next cursor; record IDs and current versions are stable. Clinical fields are excluded from finance-only detail responses. Error responses never expose a stack trace or raw clinical data. OpenAPI currently describes route-level permissions/status semantics; complete generated request/response schemas for every administrative endpoint remain a documentation hardening item.
