# Architecture and data flow

```mermaid
flowchart LR
  Visitor[Public visitor] --> Web[Next.js App Router / Vercel]
  Staff[Invited organization member] --> Web
  Web -->|same-origin /api proxy; HttpOnly session cookie| API[Nest modular API]
  API --> Auth[Better Auth / TOTP]
  API --> Access[Session + membership + permission + object scope]
  Access --> Services[Claims / review / payments / reconciliation / CMS]
  Services --> PG[(PostgreSQL / Neon)]
  Auth --> PG
  PG --> Outbox[Transactional outbox + durable job state]
  Outbox --> Worker[Worker with leases + retries]
  Worker --> Rules[Deterministic validation / bounded demo AI]
  Worker --> Adapter[Declared-capability payment adapter]
  Adapter -. disabled pending contract .-> Orange[Orange Money business channel]
  API --> S3[(Private S3-compatible quarantine)]
  Worker --> Scanner[Content signature + size + ClamAV]
  Scanner --> Clean[(New clean server-only object key)]
  API -->|scoped short-lived GET link| Clean
```

## Boundaries

- UI components never authorize decisions, recompute authoritative payable remainders or confirm settlement.
- Every authenticated domain request has one organization context (`X-Organization-ID`), checked against an active database membership. Headers do not confer access.
- Claims belong to both facility and insurer under a permitted contract. Finance serialization deliberately omits patient identifiers, encounters, items, findings and decision reasons.
- No global platform-admin clinical bypass. Audit and CMS permissions are separate from clinical/reviewer permissions.
- `packages/domain` centralizes money, permissions, schemas and allowed states. `packages/db` owns transactions. API services own workflow and explicit SQL scoping.
- Database state is authoritative; UI polling refetches on focus/reconnect. There is no unscoped realtime broadcast service.
- Domain mutations and outbox insertion share a transaction. A worker crash does not discard submitted claims. Processing errors are distinguishable from validation findings.

## Claim state diagram

```mermaid
stateDiagram-v2
  DRAFT --> SUBMITTED: facility submits immutable version
  SUBMITTED --> VALIDATING: durable worker
  VALIDATING --> AWAITING_REVIEW: findings or clean run
  VALIDATING --> NEEDS_INFORMATION: allowed domain transition
  AWAITING_REVIEW --> NEEDS_INFORMATION: insurer reason
  NEEDS_INFORMATION --> DRAFT: corrected draft
  AWAITING_REVIEW --> APPROVED: human decision
  AWAITING_REVIEW --> PARTIALLY_APPROVED: human decision
  AWAITING_REVIEW --> REJECTED: human decision
  DRAFT --> WITHDRAWN
  SUBMITTED --> WITHDRAWN
  AWAITING_REVIEW --> WITHDRAWN
```

Withdrawal is available to the submitting facility before conflicting decisions or payments and retains submitted history. Appeals are separate records and do not rewrite the original decision. Appeal review records an outcome narrative; changing an already payable decision requires an approved adjustment workflow, not an unsafe direct edit.

## Payment state diagram

```mermaid
stateDiagram-v2
  CREATED --> AWAITING_AUTHORIZATION
  AWAITING_AUTHORIZATION --> AUTHORIZED: separate checker
  AUTHORIZED --> PROCESSING: execution outbox
  PROCESSING --> AWAITING_FUNDS
  AWAITING_FUNDS --> PROCESSING: confirmed funding path
  PROCESSING --> UNKNOWN_PENDING_INVESTIGATION: ambiguous result
  UNKNOWN_PENDING_INVESTIGATION --> SETTLED: verified evidence
  UNKNOWN_PENDING_INVESTIGATION --> FAILED: reliable final failure
  PROCESSING --> SETTLED: verified evidence
  PROCESSING --> FAILED: reliable final failure
  SETTLED --> REVERSED: explicit verified reversal
  AWAITING_AUTHORIZATION --> CANCELLED
  AUTHORIZED --> CANCELLED
```

The UI does not expose an unsafe arbitrary state editor. Pre-execution cancellation releases only an undispatched reservation; dispatched or unknown payments require provider-confirmed outcomes. Funding release and financial adjustments require further operator-approved command surfaces before live operation. Unknown results cannot be sent through execution again.
