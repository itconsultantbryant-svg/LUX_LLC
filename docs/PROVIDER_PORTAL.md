# Healthcare provider portal

The provider portal is `/institutional/provider`; customer bill intake is `/pay`. Both use authenticated API operations. The synthetic demo remains separate. Provider staff need an active membership in an approved provider organization and recent MFA. Managers maintain the organizational profile; organization administrators invite and manage staff through the existing invitation workflow.

Customers choose from the verified directory, scan a same-origin provider QR code, upload a QR photograph, or paste its link. A QR identifies a provider; it never proves verification. Camera scanning requires browser camera permission and a secure context (localhost is supported). Customers can create a 15-minute, single-use association code for their selected provider, or enter an itemized bill themselves and attach a photo/PDF. No patient phone-number search is exposed.

Bills preserve provider, customer, reference, issue date, currency, integer quantities and exact minor-unit prices. Totals use integer arithmetic. Each amendment creates an immutable revision containing its line items and reason, with a separate change history. Documents and confirmations are tied to a revision. Competing amendments use an expected revision; stale submissions must refresh. Once a payment request exists, corrections are submitted as separate records instead of replacing the invoice.

The customer must review the current provider, currency, items and total. Authorized provider staff must separately confirm invoice authenticity or service delivery and reference a supporting document for the current revision. Provider staff cannot supply the customer's acceptance merely by being staff. Every document download, bill, receipt and mutation checks the current user's ownership, caregiver grant or organizational membership.

An independent PlatformAdmin with recent MFA reviews providers at `/institutional/provider-verification`. A review records the external registry evidence reference, reviewer, reason, verified profile and expiry. Organization creators/members cannot approve their own provider. AI output cannot grant verification. Changes to licensed profile details reset verification. Live payment creation and ledger capture recheck current verification, organization approval, evidence, customer acceptance and unresolved disputes/corrections in PostgreSQL.

Payment requests are requests for authorization, not receipts or proof of settlement. Issued receipts require confirmed partner settlement under the existing ledger constraints. Disputes and correction proposals are recorded for authorized operational review; this release does not add their resolution or refund execution workflow.

## Development and production boundaries

Use fictional data only in development. The deployed API still uses temporary document storage until the prepared private Neon object-storage credentials are approved for deployment. Production rejects temporary storage and simulated payment processing. No live healthcare payment adapter is enabled, and no production administrator has been created automatically. Camera capture on physical devices and live provider evidence checks remain operational validation tasks.

## Validation

`pnpm test:providers` migrates an isolated schema in the Neon test database, runs authorization, exact-total, revision/evidence, verification and concurrency scenarios, and removes the schema afterward. Local tests also round-trip a generated QR code through the decoder and reject foreign-origin links. Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` for the application checks.

For the optional responsive smoke check, build the frontend, run `pnpm --filter @healthwallet/web exec vite preview --host 127.0.0.1 --port 5175 --strictPort`, and start a dedicated headless Chrome with debugging port 9224 and a temporary profile. Run `PROVIDER_BROWSER_TESTS=1 pnpm test:providers -t 'renders provider'`. The harness sends API requests to the isolated test application, never granting test administrators access to the development database. It checks provider and customer layouts at 360px and 1280px and writes provider screenshots to `/tmp/lux-provider-360.png` and `/tmp/lux-provider-1280.png`.
