# HealthWallet Liberia — Screen Inventory

Mobile-first screens. Each entry lists purpose, primary role, and AI involvement. Demo environment shows a persistent **Demo / simulation** banner.

---

## 0. Global chrome

| ID   | Screen / element                     | Notes                                                               |
| ---- | ------------------------------------ | ------------------------------------------------------------------- |
| G-01 | App shell / navigation               | Bottom nav on mobile; brand “HealthWallet Liberia”                  |
| G-02 | Environment banner                   | Demo vs live; never ambiguous                                       |
| G-03 | Auth gate                            | Session required for protected routes                               |
| G-04 | Offline / slow-network notice        | Limited-bandwidth affordances                                       |
| G-05 | Fee and restriction disclosure modal | Reused before money movement                                        |
| G-06 | Floating LUX assistant widget        | Every screen except `/assistant`; same engine as the full assistant |
| G-07 | Customer location (opt-in)           | Captured on sign-in and on Home; clearable anytime                  |

---

## 1. Marketing and onboarding

| ID   | Screen                                  | Primary roles        | AI                                         |
| ---- | --------------------------------------- | -------------------- | ------------------------------------------ |
| M-01 | Landing                                 | Anonymous            | —                                          |
| M-02 | How it works                            | Anonymous            | Explains LUX HealthTrust role (non-claimy) |
| M-03 | Register (phone-first)                  | Anonymous → customer | —                                          |
| M-04 | Verify OTP                              | Anonymous            | —                                          |
| M-05 | Consent (data + AI document processing) | New user             | —                                          |
| M-06 | Role selection / invite accept          | New user             | —                                          |

---

## 2. Customer / caregiver

| ID   | Screen                  | Purpose                                    | AI                                            |
| ---- | ----------------------- | ------------------------------------------ | --------------------------------------------- |
| C-01 | Home                    | Balance summary, next actions, open bills  | Status explanations grounded in case data     |
| C-02 | Wallet detail           | Ledger, available / reserved / spent       | —                                             |
| C-03 | Top-up                  | Initiate deposit via payment adapter       | —                                             |
| C-04 | Contribution pots       | List pots funding this customer            | —                                             |
| C-05 | Submit bill — capture   | Photo / file / manual entry                | —                                             |
| C-06 | Bill processing         | Job progress for extraction/validation     | Extraction running                            |
| C-07 | Review extraction       | Confirm fields + evidence highlights       | User corrects AI output                       |
| C-08 | Funding proposal        | Eligible sources, shortfalls, restrictions | AI-ranked suggestions; deterministic totals   |
| C-09 | Confirm payment         | Fees, recipients, auth                     | —                                             |
| C-10 | Payment status          | Success / pending / failed / needs review  | Plain-language next steps                     |
| C-11 | Receipt                 | Shareable receipt + audit reference        | —                                             |
| C-12 | Bill history            | Filter by status                           | —                                             |
| C-13 | Profile & security      | Phone, consents, devices                   | —                                             |
| C-14 | Help / case explain     | “Why was this reviewed?”                   | Grounded on decision log                      |
| C-15 | Assistant chat          | Free-text, dictation, bill upload          | Deterministic intent + approval-gated actions |
| C-16 | Nearby & emergency care | Verified providers ranked by distance      | Location-ranked; emergency-ready first        |
| C-17 | Orange Money top-up     | Real-time (sandboxed) wallet deposit       | —                                             |

---

## 3. Contributors (family / diaspora)

| ID   | Screen               | Purpose                           | AI                                       |
| ---- | -------------------- | --------------------------------- | ---------------------------------------- |
| F-01 | Find recipient       | Invite code / phone match         | —                                        |
| F-02 | Contribute           | Amount, restriction options, fees | Optional guidance on restriction clarity |
| F-03 | Contribution history | Status of gifts                   | —                                        |

---

## 4. Providers

| ID   | Screen           | Purpose                                                 | AI                                                           |
| ---- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| P-01 | Provider home    | Pending confirmations, payouts                          | —                                                            |
| P-02 | Confirm bill     | Attest bill authenticity                                | Assist comparing submitted vs provider record when available |
| P-03 | Payouts          | Settlement list and status                              | —                                                            |
| P-04 | Provider profile | Directory fields; verification badge only if authorized | —                                                            |

---

## 5. Reviewer / administrator

| ID   | Screen             | Purpose                                   | AI                              |
| ---- | ------------------ | ----------------------------------------- | ------------------------------- |
| R-01 | Review queue       | Cases by reason code                      | Packet summary                  |
| R-02 | Case detail        | Evidence, extraction, rules, risk signals | Summarize + cite; human decides |
| R-03 | Decision form      | Approve / reject / request info           | —                               |
| A-01 | Programs           | Create/edit eligibility and caps          | —                               |
| A-02 | Fee & limit config | Environment-scoped                        | —                               |
| A-03 | Providers admin    | Verification workflow                     | —                               |
| A-04 | AI metrics         | Involvement vs human-review rates         | Instrumentation only            |
| A-05 | Audit / reports    | Exports for authorized roles              | —                               |
| A-06 | Adapter health     | Sandbox vs live connectivity              | —                               |

---

## 6. Employers / sponsors

| ID   | Screen                 | Purpose                     | AI  |
| ---- | ---------------------- | --------------------------- | --- |
| E-01 | Organization dashboard | Allowances, utilization     | —   |
| E-02 | Fund program / pot     | Transfers with restrictions | —   |
| E-03 | Enrollment             | Employees / beneficiaries   | —   |
| S-01 | Sponsor program detail | Rules, spend, remaining     | —   |

---

## 7. Partner read-only

| ID    | Screen             | Purpose                | AI  |
| ----- | ------------------ | ---------------------- | --- |
| PR-01 | Authorized reports | Contract-bound metrics | —   |

---

## 8. System / empty / error

| ID   | Screen      | Notes                             |
| ---- | ----------- | --------------------------------- |
| X-01 | Not found   | —                                 |
| X-02 | Forbidden   | Clear permission message          |
| X-03 | Job failed  | Retry extraction; no fake success |
| X-04 | Maintenance | —                                 |

---

## Implementation priority (foundation → demo journey)

1. G-01, G-02, M-01, M-03–M-05, C-01, C-05–C-11
2. R-01–R-03, A-04
3. F-01–F-03, P-01–P-03
4. Remaining admin / org / partner screens

See [IMPLEMENTATION_BACKLOG.md](./IMPLEMENTATION_BACKLOG.md).
