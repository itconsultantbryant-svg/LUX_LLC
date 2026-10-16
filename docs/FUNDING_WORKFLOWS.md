# Healthcare funding workflows

Migration `0005_messy_bromley` adds saving goals, support links, funding checkout payments, provider event records, and consent-linked savings recommendations. These funding checkouts are separate from existing provider bill-payment intents and legacy bill contributions.

## Customer and contributor flows

- `/save`: create private goals, see confirmed-deposit progress, review deposits and authorize them. Goal progress is cumulative confirmed deposits assigned to that goal; it is not an earmarked or spendable balance.
- `/support`: create and revoke support links with a limited beneficiary label, accepted currencies, category restrictions and 1–90 day expiry. The token has 256 bits of entropy; the lookup table stores its SHA-256 hash. Creation retry records retain the original response so a lost response is recoverable.
- `/contribute#<token>`: anonymously resolve a link, confirm the beneficiary privately, then sign in to review and authorize a contribution. Tokens are URL fragments, avoiding access-log/referrer exposure. No beneficiary ID, telephone, goal label, bill, or medical document is returned.
- `/history`: pending, confirmed and failed deposits and contributions, plus receipts for confirmed payments. Receipt endpoints verify payer or beneficiary access every time. Legacy bill contributions remain available through their existing protected API.
- Home displays funding activity and pending counts. Touch targets, labels, focus after review, live status/error announcements and retry feedback use the existing design system.

## Financial safety

1. A server-priced quote freezes amount, currency, provider fee, beneficiary, categories and provider. Quotes expire after ten minutes.
2. Explicit authorization checks link validity again. An adapter initiates the payment using the immutable checkout ID as its provider idempotency key. An initiation response never credits funds.
3. Only the trusted adapter-event processor can confirm payment. It checks reference, provider, mode, currency and total against the stored authorization. There is no public endpoint that accepts an arbitrary claimed confirmation.
4. A payment row lock serializes competing events. Provider event IDs and payload hashes reject conflicting replays. Distinct event IDs for the same payment still create only one credit.
5. Confirmation atomically creates the beneficiary's source allocation, posts a balanced exact-integer journal, records confirmation and creates the stable receipt reference. Database triggers prohibit changes to financial terms or confirmed payments and require the matching posted credit.
6. Available credit excludes fees. Failed and pending payments post no ledger credit. Late success can reconcile a previously failed attempt; late failure never reverses a confirmed payment. Corrections require a separate reviewed reversal workflow.
7. Each currency has separate wallet accounts. No implicit FX. Contribution categories are carried into the ledger allocation and enforced by the existing reservation service.
8. A confirmed payment is not partner settlement verification: settlement remains `expected`. Sandbox records never attest to real funds held by a partner.

Owner-only records, session revocation/suspension checks, origin checks, strict bodies and rate limits apply to financial actions. Support revocation blocks new authorizations, while payments already authorized can settle under their original terms.

## Provider capability and deployment boundary

The configured implementation is `SandboxFundingAdapter`: LRD/USD, zero simulated fees, and clearly labeled simulated international contributions. The development simulation control requires the payer's valid session and is disabled in production. Production capabilities report funding unavailable until a live adapter is connected. No live international transfer, mobile-money collection or provider agreement is claimed.

A live integration must supply authoritative capability/fee quoting, idempotent initiation, and provider-specific signature validation before calling `FundingService.confirm` in a transaction. Validate raw signed events according to that provider, preserve event IDs, and use separate settlement evidence. Do not turn the development simulation route into a live webhook. Configure adapters centrally before enabling live payments.

## Optional guidance

`financial_guidance` consent (`funding-v1`) is separate from sign-in consent. The current fallback is explicitly a transparent planning calculator, not connected AI: (target minus confirmed goal deposits) divided by selected weeks, rounded up in integer minor units. It does not access medical records, send data to an AI vendor, assess affordability or move money. Recommendations retain consent provenance and explain their inputs. Users can edit or dismiss them; withdrawal dismisses and hides recommendations and blocks regeneration. An AI provider remains an integration task and must preserve this consent boundary.

## Verification

`pnpm test:funding` targets the existing `healthwallet_test` database, creates a random isolated schema, applies all migrations and synthetic fixtures, and removes the schema afterward. CI includes the same suite with PostgreSQL. Tests cover concurrent and repeated confirmations, beneficiary attribution, pending/failed balances, idempotency conflicts, link expiry/revocation, quote expiry, cross-user goal/payment/receipt access, exact-money validation, mismatched events, production simulation blocking and guidance consent/withdrawal.

Run `pnpm db:migrate` only after database tests pass, then build and deploy the API code. The frontend must point to a backend with migration 0005 and the funding routes installed.
