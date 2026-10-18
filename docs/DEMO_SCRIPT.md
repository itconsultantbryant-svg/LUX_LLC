# Demo Script — HealthWallet Liberia × LUX HealthTrust

For the **Orange Summer Challenge**. Runs entirely on sandbox adapters: **no real money,
SMS, or Orange settlement moves**. The product fails closed when a live adapter is
missing. This script demonstrates that honestly.

## Prerequisites

- `pnpm install` at the repo root.
- Dev environment: `pnpm dev:web` (frontend at `http://127.0.0.1:5173`) with the API
  available at `/api` (local dev server or the deployed Neon Function — both verified).
- Sandbox adapters active (`APP_ENV=development`, `MESSAGING_ADAPTER=sandbox`,
  `AI_ADAPTER=sandbox`, `PAYMENT_ADAPTER=sandbox`).
- A reviewer/operator with an **MFA-enabled `platform_admin` session** to open the
  Review queue and Journey metrics (see “Reviewer console setup” below). This is the
  same control the product would use after Orange onboarding.

## Reviewer console setup (once)

The API requires MFA for institutional operations. In development, provision one user
in a single step:

```bash
pnpm seed:admin
```

This grants `customer`, `reviewer`, and `platform_admin` to the seed phone
(`+999700000009` by default), creates an 8-hour sandbox session with MFA already
verified, and prints the `hw_session` cookie to paste into the browser on the app
origin. It refuses to run against production or a non-dev database and creates no
funds or settlement. Open `/institutional/reviews` and `/institutional/metrics`.

Alternative: sign in through `/account` with any phone (the sandbox code is shown
on screen) and complete MFA enrollment through `/account/security` for an existing
authorized reviewer, then use the Review queue link under **More**.

## Walkthrough

### 1. Fund a wallet (simulated)

1. Tap **Save Money**.
2. Review the transparent **fee disclosure** (sandbox: every fee is exactly `0`).
3. Start a deposit, review amount and fees, authorize. Sandbox adapters accept every
   payment — the UI labels this `SIMULATION — no real money moves`.
4. After the simulated confirmation, available balance increases; the receipt notes
   `settlementVerified: false`.

Key honesty check: pending payments never count as spendable, and no step claims real
Orange settlement.

### 2. Submit a bill and run AI extraction

1. On the app **Journey** page (`/journey`, demo dev route) run **LUX HealthTrust sandbox
   extract** — it calls the non-persistent demo endpoint and clearly labels the result
   `SIMULATION` with mode and confidence.
2. In the member flow, upload a document to a bill (e.g. `assets/sample-bill.txt`). The
   document is stored through the private storage adapter and the bill stays `draft`
   until a human and/or extraction validates it.
3. Admin/reviewer: `POST /api/bills/:id/extract` (see the reviewer console above) runs
   the persistent extraction journey: it writes the `ai_runs` row, opens a review case,
   and moves the bill to `needs_review`.
4. **LUX HealthTrust (sandbox)** returns structured fields with confidence and evidence
   references. Because sandbox confidence is deliberately `0.64` (below the `0.75`
   threshold), the bill moves to `needs_review` and a review case opens — the human
   review gate works instead of pretending the AI is always right. Extraction fails
   closed (`400`) when a bill has no document.

### 3. Reviewer console

1. Open **More → Review queue** (`/institutional/reviews`) as the MFA reviewer.
2. See the open case, its reason codes (e.g. `LOW_CONFIDENCE`), and findings.
3. Approve (or return / reject). Approving moves the bill to `validated` and records the
   decision and author.
4. Open **More → Journey metrics** (`/institutional/metrics`) to show the M-01/M-02
   instrumentation: AI runs computed from `ai_runs`/`ai_artifacts`, `human_review_required`
   cases, review decisions, funding/payment statuses, and partner settlements (all
   `expected` — never fabricated).

### 4. Sponsor program administration (optional)

As an organization admin or platform reviewer:

1. `POST /api/programs` to draft a program for a sponsor organization.
2. `PATCH /api/programs/:id` to activate it.
3. `POST /api/programs/:id/vouchers` to issue a ledger-only voucher to a beneficiary
   phone. Balances update in the platform ledger; the settlement stays `expected`
   (sandbox), and the vault code is returned once.

### 5. Reconciliation (ops control)

`POST /api/admin/reconcile` expires stale quotes/pending payments, releases expired
reservations, and reports settlement state. It **never marks a settlement confirmed**
without a live partner event.

## What the demo must NOT claim

- No live Orange Money transfer, SMS, or USSD.
- No live model accuracy (the Orange 85–90% definition is unresolved — M-03).
- No cash movement: the ledger and partner settlements are simulated and labeled.

## Bandwidth and performance

`node apps/api/scripts/run-perf-smoke.mjs` provisions an isolated test schema, boots the
API, and reports read-path latency and payload sizes on the seed data. Payload budget
(`< 64 KB`) is the binding constraint for limited-bandwidth devices (P4-04).

## Verification commands

```bash
pnpm check                                    # format, lint, typecheck, 63+ unit tests, build
node apps/api/scripts/run-operations-tests.mjs  # extraction→review→programs→metrics→reconcile (8 tests)
node apps/api/scripts/run-provider-tests.mjs    # provider portal integration
node apps/api/scripts/run-perf-smoke.mjs        # latency + payload budgets
```
