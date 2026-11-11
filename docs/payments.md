# Payment and reconciliation runbook

## Authority

LUX supplies software and records. The insurer controls coverage and authorizes payment. Orange Money is the intended channel, not an assumed payout API. No insurer or facility principal is held in a LUX wallet. No Orange Money PIN belongs in LUX.

`demo` is synthetic. A production Node runtime rejects it unless `DEPLOYMENT_TIER=demo` is explicitly set, both origins are HTTPS and the database contains only synthetic organizations. This is a hosted-demonstration exception, not approval for live-production use. `sandbox` and `live` currently declare no contracted business-payment capabilities and fail closed. `manual` cannot initiate a business payout through an invented API. An approved manual procedure can use a provider-authorized external process and independent verification; it must be explicitly enabled with `MANUAL_VERIFICATION_ENABLED=true`. This switch is not a substitute for contracts or approval.

Demo dispatch requires a generated four-digit code displayed by LUX, **never a real Orange Money PIN**. It is actor/organization/payment/version-bound, expires after two minutes, HMAC-stored, limited to five attempts and single-use. Successful command replay does not redispatch. This simulated authorization step must not be reused as a real provider PIN collection flow.

## Normal synthetic journey

1. Facility submits a versioned claim. Worker validates; insurer reviewer records a reasoned decision.
2. Insurer maker opens the approved claim and requests a principal amount not exceeding its unreserved payable remainder.
3. The payment stores destination and fee-policy snapshots. Review the full base/debit/net/fee/shares in Payments.
4. A **different** insurer finance account checks and authorizes the request with a fresh session.
5. Finance executes. Durable work dispatches the deterministic demo adapter. No real funds move.
6. Only verified provider-result handling can confirm settlement and create a final fee assessment/earned ledger entry.
7. Reconciliation compares records and opens exceptions. Fee accruals are not shown as actual distribution.

## Fee policy

2% of successful base payment: 1% of base for LUX and 1% of base for Orange. This is not 1% of the 2% fee.

| US$1,000 base     | Insurer debit | Facility net | LUX | Orange |
| ----------------- | ------------: | -----------: | --: | -----: |
| INSURER_ADDED     |         1,020 |        1,000 |  10 |     10 |
| FACILITY_DEDUCTED |         1,000 |          980 |  10 |     10 |
| UNCONFIGURED      |       blocked |      blocked |   — |      — |

Calculate total fee once using integer half-up rounding. LUX receives `floor(totalFee/2)`; Orange receives the residual. A US$0.01 base rounds to zero fee; no minimum is invented. Partial settlements assess each successful payment once. Failed instructions/retries do not earn fees. USD and LRD are never summed or converted. Provider currency exponents and supported currencies must be approved before live use.

`fee_assessments` is assessed/accrued allocation; `fee_settlement_records` is separately verified cash allocation. The application currently has **no live split/collection adapter**. Never populate cash settlement merely because a fee was calculated. Live collection must stay blocked until the contract-supported flow is implemented and tested.

## Timeout / outage

- A dispatch with an ambiguous network outcome becomes `UNKNOWN_PENDING_INVESTIGATION` and keeps its payable reservation.
- Do not resend as a new payout or manually release the reservation.
- Queue a status inquiry or investigate a contracted settlement report.
- The attempt is marked `DISPATCHING` before network initiation. If a worker crashes after acceptance, recovery queries status instead of initiating again.
- A late verified success resolves the original payment and its reservation without another attempt or fee.
- A reliable final failure may release the reservation. A browser redirect, typed reference or timeout is not reliable failure/success evidence.
- Delayed nonfinal callbacks cannot regress settled state. Only explicit verified reversal can create compensating entries.

## Imports and exception resolution

1. Stage rows with reference, integer amount, currency and destination. Inspect preview and row errors.
2. Confirm once. The database rejects an identical file checksum. Duplicate references in a file become exceptions.
3. Exact reference is checked first; amount/currency/destination must agree. No fuzzy automatic matching.
4. Match/import is not settlement verification. An authorized independent procedure must corroborate external evidence.
5. Record owner/notes/evidence when resolving an exception. Resolution does not directly set a payment to paid.
6. Financial corrections must be compensating entries under an approved refund/adjustment policy. Do not edit historical ledgers or submitted decisions.

Current importer detects unmatched incoming records, duplicate references, currency, amount and destination mismatch. Seed data includes unresolved timeout exceptions. Automated missing-provider/fee-cash exception generation and provider-report import mapping are additional release gates, documented in the capability matrix.
