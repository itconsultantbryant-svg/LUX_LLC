# Acceptance Criteria — Main Healthcare-Payment Journey

Product: **HealthWallet Liberia** · AI: **LUX HealthTrust**

Journey: Save or receive support → submit bill → AI extract/check → user review → eligible funding → authorized payment → receipt and audit.

Criteria use **Given / When / Then**. Unless noted, they apply in `demo` and `development` with sandbox adapters. Live criteria additionally require confirmed partner credentials (see unresolved U-02, U-03).

---

## AC-01 — Funded customer can start a bill

- **Given** a customer with available wallet or contribution balance ≥ 0
- **When** they open Submit bill
- **Then** they can capture a document and/or enter structured fields
- **And** consent for AI document processing is recorded or already valid

## AC-02 — Document stored privately

- **Given** a bill submission with a file
- **When** upload completes
- **Then** the object is stored via the private storage adapter
- **And** the browser cannot access a permanent public URL
- **And** an extraction job is enqueued

## AC-03 — LUX HealthTrust extraction is meaningful and measurable

- **Given** an enqueued extraction job
- **When** the AI adapter runs
- **Then** structured fields are produced (provider, patient ref, date, line items or total, currency)
- **And** confidence and evidence references are stored
- **And** output passes schema validation or the case is marked failed/needs_review
- **And** an `ai_involved` event is recorded for this workflow step
- **And** sandbox mode is labeled when not live

## AC-04 — Deterministic validation runs

- **Given** schema-valid extraction (or user-entered fields)
- **When** validation executes
- **Then** arithmetic/currency/required-field checks run without model improvisation
- **And** failures produce machine-readable reason codes

## AC-05 — User review before funding

- **Given** extracted or partially validated fields
- **When** the customer opens Review extraction
- **Then** they can confirm or correct each material field
- **And** corrections are stored as the confirmed bill version
- **And** payment cannot proceed on unconfirmed extraction when policy requires review

## AC-06 — Eligible funding determination

- **Given** a confirmed bill amount and customer funding sources
- **When** the funding engine runs
- **Then** eligible amounts per source are computed deterministically from rules and restrictions
- **And** ineligible sources show restriction reasons
- **And** AI may suggest ranking but cannot change ledger math
- **And** shortfall is explicit when funds are insufficient

## AC-07 — Human review gate

- **Given** low confidence, conflicting data, restricted category, threshold breach, or risk flag
- **When** funding or payment authorization is requested
- **Then** status becomes `needs_review`
- **And** `human_review_required` is recorded with reason codes
- **And** settlement does not proceed until an authorized reviewer or resolved policy path allows it

## AC-08 — Authorization and payment

- **Given** a funding proposal within policy and no open review block
- **When** the customer confirms payment and fees are disclosed
- **Then** a payment intent is created with an idempotency key
- **And** the payment adapter is invoked
- **And** ledger reservations/postings match adapter outcome
- **And** demo/sandbox success is labeled simulation — never implied as live Orange settlement

## AC-09 — Receipt and audit

- **Given** a terminal payment status (`paid` or `failed`)
- **When** the result is finalized
- **Then** a receipt (or failure record) is available to the customer
- **And** an audit trail includes bill version, funding allocation, adapter mode, actor ids, and timestamps
- **And** provider-facing payout visibility updates when applicable

## AC-10 — No fabricated success

- **Given** adapter timeout, rejection, or insufficient funds
- **When** the client polls status
- **Then** the UI shows failure or pending honestly
- **And** no hardcoded “payment successful” path skips the adapter

## AC-11 — Metrics integrity

- **Given** completed journeys in an environment
- **When** AI metrics are queried
- **Then** AI involvement rate and no-human-review rate are available as **separate** measures
- **And** neither is presented as the Orange 85–90% figure until U-01 is resolved and methodology documented

---

## Journey-level Definition of Done (Phase 2)

- Automated check covers AC-01–AC-10 on sandbox adapters.
- Manual demo script can complete the path on mobile viewport with demo banner visible.
- Unresolved custody and Orange interface questions remain listed; not papered over in UI copy.
