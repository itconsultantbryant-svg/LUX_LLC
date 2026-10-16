# HealthWallet Liberia — Product Requirements Document

| Field                        | Value                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Product                      | HealthWallet Liberia                                       |
| AI engine                    | LUX HealthTrust                                            |
| Platform operator            | LUX AI                                                     |
| Intended integration partner | Orange Liberia                                             |
| Document status              | Foundation (v0.1)                                          |
| Environment posture          | Demo and development unless explicitly configured for live |

**Important:** This document does not claim a signed commercial agreement, regulatory approval, or live Orange Liberia integration. Partner access, custody of funds, and regulatory authority remain unresolved until confirmed in the [Assumptions and Integration Register](./ASSUMPTIONS_AND_INTEGRATIONS.md).

---

## 1. Purpose

Help uninsured and underserved Liberians prepare financially for healthcare, receive organized contributions, and pay verified healthcare providers.

Primary journey:

**Save or receive support → submit a healthcare bill → LUX HealthTrust extracts and checks information → user reviews details → system determines eligible funding → authorized payment proceeds → receipt and audit records are generated.**

AI must perform meaningful, measurable work throughout the product. HealthWallet Liberia is not a conventional wallet with a decorative chatbot.

---

## 2. Goals and non-goals

### Goals

- Enable customers and caregivers to build healthcare savings and receive restricted contributions.
- Accept healthcare bills (document or structured entry), extract fields with LUX HealthTrust, and validate against evidence.
- Determine eligible funding from wallet balances, contribution pots, and program rules with transparent restrictions.
- Authorize and execute provider payments through partner adapters (sandbox until credentials exist).
- Produce receipts, audit trails, and AI involvement metrics for every material decision.
- Support providers, administrators, contributors, employers, NGOs, and authorized partners with role-appropriate access.
- Remain usable on mobile networks with limited bandwidth; use plain English.

### Non-goals (current phase)

- Claiming live Orange Money settlement or USSD production access without confirmed interfaces.
- Guaranteeing insurance coverage, provider credentialing, or model accuracy percentages.
- Building multiple microservices; start as a modular application.
- Silent auto-approval of uncertain, conflicting, exceptional, or restricted cases.

---

## 3. Users and jobs to be done

| Persona                         | Primary jobs                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Customer / caregiver            | Save for care, submit bills, review AI extraction, authorize payments, track status |
| Healthcare provider             | Confirm identity, issue/verify bills, receive payouts, view settlement status       |
| Administrator / reviewer        | Resolve uncertain cases, manage programs, audit payments, configure limits          |
| Family / diaspora contributor   | Contribute to a named person or pot with optional restrictions                      |
| Employer / organization         | Sponsor employee healthcare allowances with policy rules                            |
| NGO / charity / donor / sponsor | Fund programs with eligibility and use restrictions                                 |
| Financial / insurance partner   | Read authorized reporting; participate via adapters when agreements exist           |

---

## 4. Core capabilities

### 4.1 Identity and access

- Account registration and authentication (phone-first preferred; email optional).
- Role-based permissions (see [Role and Permission Matrix](./ROLE_PERMISSION_MATRIX.md)).
- Explicit consent for document processing and AI analysis.
- Session and device awareness suitable for shared phones.

### 4.2 Wallets and contributions

- Personal healthcare wallet balances with ledgered transactions.
- Contribution pots (family, employer, NGO) with restriction metadata.
- Transparent fee display before commit.
- Clear separation of available, reserved, and spent amounts.

### 4.3 Bills and documents

- Upload bill images/PDFs or enter structured bill details.
- Private object storage for documents.
- Background extraction and validation jobs.
- User review and correction of extracted fields before funding decisions.

### 4.4 LUX HealthTrust (AI)

Meaningful AI work includes, at minimum:

| Workflow                | AI responsibility                                                      | Human involvement                                     |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Bill intake             | Extract provider, patient, dates, line items, totals, currency         | User confirms; reviewer if low confidence or conflict |
| Validation              | Cross-check totals, detect missing fields, flag inconsistencies        | Reviewer for exceptions                               |
| Eligibility             | Rank applicable funding sources against program rules and restrictions | Deterministic rules own final eligibility math        |
| Fraud / anomaly signals | Surface risk indicators with evidence citations                        | Reviewer for high-risk                                |
| Support guidance        | Explain status and next steps grounded in case data                    | No fabricated coverage claims                         |
| Ops assist              | Summarize case packets for reviewers                                   | Reviewer decides                                      |

**Measurement requirement:** Track AI involvement in workflows separately from the percentage of eligible cases processed without human review. Never invent performance or automation percentages. The Orange “85–90% AI” objective is recorded as an unresolved definition question.

### 4.5 Funding determination and payments

- Deterministic allocation engine using confirmed bill amounts and funding rules.
- Payment authorization only after user confirmation (and reviewer approval when required).
- Provider adapters for payments (sandbox labeled until live credentials).
- Idempotent payment intents and reconciliation jobs.
- Receipts and immutable audit records.

### 4.6 Providers and programs

- Provider directory with verification status that must not be fabricated.
- Program definitions (eligibility, caps, allowed categories, sponsors).
- Reporting for administrators and authorized partners.

### 4.7 Notifications and reporting

- SMS/WhatsApp/email adapters (sandbox until partner messaging is confirmed).
- Transaction history, AI decision logs, fee disclosures, and exportable audit reports.

---

## 5. Main healthcare-payment journey (summary)

Detailed acceptance criteria: [ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md](./ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md).

1. Customer has or receives funds in a healthcare wallet / contribution pot.
2. Customer submits a healthcare bill (document and/or structured fields).
3. System stores the document privately and enqueues extraction.
4. LUX HealthTrust extracts fields and confidence; validation checks run.
5. Customer reviews and corrects details; system records the confirmed bill.
6. Funding engine computes eligible sources and amounts with restriction reasons.
7. Customer confirms payment; reviewer intervenes if required by policy.
8. Payment adapter executes (sandbox or live per environment).
9. Ledger updates; receipt and audit artifacts are generated; notifications sent.

---

## 6. Quality, safety, and compliance principles

- AI outputs grounded in available evidence; cite sources (document regions, rule IDs).
- Deterministic accounting, payment authorization, and permission controls.
- Human review for uncertain, conflicting, exceptional, or restricted cases.
- Transparent fees, funding restrictions, and transaction status.
- Explicit demo vs live environment labeling.
- No fabricated provider verification, insurance coverage, model accuracy, or transaction success.
- Secrets never in browser code, logs, screenshots, or source control.
- Configurable defaults for reversible design choices; no silent assumption of legal authority, custody, or partner access.

---

## 7. Success metrics (instrumented; not invented)

Until baseline measurement exists, report only instrumented metrics:

- Journey completion rate (submit → paid / failed / needs review).
- Share of bills with AI extraction completed.
- Share of cases requiring human review (by reason code).
- AI field correction rate after user review.
- Payment success / failure / reconciliation lag (by adapter mode).
- Time-to-first-meaningful-status on constrained networks.

Do not publish an “AI percentage” until Orange’s definition is confirmed and measurement is implemented.

---

## 8. Environments

| Environment   | Purpose                                | Partner adapters                              |
| ------------- | -------------------------------------- | --------------------------------------------- |
| `development` | Local engineering                      | Sandbox / simulation                          |
| `test`        | Automated CI checks                    | Sandbox / simulation                          |
| `demo`        | Orange Summer Challenge demos          | Sandbox with visible simulation labels        |
| `production`  | Live operations (only when authorized) | Live adapters only with confirmed credentials |

---

## 9. Related documents

- [Role and Permission Matrix](./ROLE_PERMISSION_MATRIX.md)
- [Screen Inventory](./SCREEN_INVENTORY.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Phased Implementation Backlog](./IMPLEMENTATION_BACKLOG.md)
- [Assumptions and Integration Register](./ASSUMPTIONS_AND_INTEGRATIONS.md)
- [Acceptance Criteria — Payment Journey](./ACCEPTANCE_CRITERIA_PAYMENT_JOURNEY.md)
- [Reusable Components Register](./REUSABLE_COMPONENTS.md)
