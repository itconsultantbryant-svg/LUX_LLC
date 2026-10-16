# Provider guide

For **healthcare provider staff and administrators** (clinics and hospitals) who
submit and confirm patient bills for payment through HealthWallet Liberia. Roles
and permissions: [ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md) §2.3,
§2.5.

> The platform routes bill payments. **Providers do not hold customer funds and
> the platform does not assert partner settlement.** In sandbox/demo, nothing
> moves real money and every settlement is marked "expected".

## 1. Register your organization

1. Create your provider profile: `POST /api/provider/profiles`.
2. An administrator authorizes the organization (`POST /api/admin/organizations/:id/reviews`)
   and sets verification status. Until then you can prepare but not confirm bills.
3. Staff join the organization through an invitation accepted in their security
   profile. Access is scoped to your organization — not to individuals.

## 2. Your portal

`GET /api/provider/portal` is your dashboard: open bills, extraction results
awaiting review, confirmations pending, payment-request status, and receipts.
`GET /api/provider/profiles/:id/bills` lists the bills for a profile.

## 3. Submit a bill

1. Upload the bill document and create the bill: `POST /api/provider/bills`
   (or `POST /api/care/intake` for the care intake path).
2. The platform extracts fields with **LUX HealthTrust** and records confidence
   and evidence. Extraction is a proposal, not a decision.
3. Review the extraction: `GET /api/care/bills/:id/extraction` and
   `POST /api/care/bills/:id/extraction-review`. Correct any field the review
   flags. Never confirm an extraction you have not reviewed.

## 4. Confirm and request payment

| Step             | Endpoint                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| Correct a bill   | `POST /api/care/bills/:id/corrections`                                       |
| Amend a bill     | `POST /api/provider/bills/:id/amend`                                         |
| Confirm a bill   | `POST /api/provider/bills/:id/confirm`                                       |
| Request payment  | `POST /api/care/bills/:id/payment-request`                                   |
| View the receipt | `POST /api/care/bills/:id/confirm` (care path), `GET /api/care/receipts/:id` |

Confirming attests that the bill is accurate and services were provided. The
customer authorizes payment from their wallet; the platform then routes funds
according to the funding rules. Your job ends at a correct, confirmed bill and an
accurate payment request.

## 5. Disputes and corrections

- **Corrections** (`POST /api/care/bills/:id/corrections`) fix details before
  confirmation.
- **Disputes** (`POST /api/care/bills/:id/disputes`) raise a disagreement (for
  example, a rejected or short payment). An administrator resolves it
  (`POST /api/admin/disputes/:id/resolve`).

Both are audited. Use them instead of re-submitting a duplicate bill.

## 6. What providers must not do

- Do not hold, receive, or promise customer funds outside the platform ledger.
- Do not assert settlement — settlement status is platform-recorded only.
- Do not confirm extractions you have not reviewed.
- Do not re-submit a bill to work around a correction or dispute; use the
  correction/dispute route so history stays intact.

## 7. Environment

In demo/sandbox the adapters are simulated and the UI is labelled as such. When
Orange Money interfaces and custody are confirmed and configured, the same flow
runs against live adapters — the provider steps do not change. Confirm with your
administrator which environment you are in before relying on any status.

## 8. Getting help

Contact your organization administrator for access and verification issues. For
payment or reconciliation questions, your administrator escalates to the platform
operator (see [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) §6).
