# HealthWallet Liberia — Assumptions and Integration Register

This register separates **confirmed facts**, **configurable defaults** (reversible), and **unresolved questions**. Do not treat defaults as legal authority, custody, or partner access.

---

## 1. Confirmed (project decisions)

| ID   | Statement                                                                              | Evidence                   |
| ---- | -------------------------------------------------------------------------------------- | -------------------------- |
| C-01 | Product name is HealthWallet Liberia; AI engine is LUX HealthTrust; operator is LUX AI | Product brief              |
| C-02 | Intended integration partner is Orange Liberia (not asserted as signed)                | Product brief              |
| C-03 | Stack: TypeScript, React, Node.js, PostgreSQL in a modular monorepo                    | Product brief + empty repo |
| C-04 | Demo/dev/test use sandbox adapters with explicit simulation labels                     | Build principles           |
| C-05 | AI involvement metrics are tracked separately from no-human-review rates               | Product brief              |
| C-06 | Existing reusable asset: `assets/LUX_AI_logo.png`                                      | Repository inspection      |

---

## 2. Configurable defaults (reversible)

| ID   | Default                                                       | Rationale                                       | Reversal                             |
| ---- | ------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| D-01 | Base currency display: LRD; optional USD dual display         | Liberia context                                 | Env `DEFAULT_CURRENCY`               |
| D-02 | Phone-first identity with OTP                                 | Mobile-first Orange ecosystem                   | Feature flag email/password          |
| D-03 | Platform holds **ledger records**; custody of real funds TBD  | Cannot assume custody                           | Replace with partner-custody adapter |
| D-04 | Low-confidence extraction → human review                      | Safety                                          | Threshold config per env             |
| D-05 | Sandbox payment success rate injectable for demos             | Demo control                                    | Disable in production                |
| D-06 | Documents retained per configurable retention days            | Ops flexibility                                 | Policy update                        |
| D-07 | Fees shown as configurable schedule (seed zeros or demo fees) | Transparency without inventing commercial terms | Admin config                         |
| D-08 | USSD deferred until approved gateway                          | Unknown availability                            | Enable messaging adapter channel     |

---

## 3. Unresolved questions (must not be silently closed)

| ID   | Question                                                                      | Impact if wrong                                      | Owner needed              |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------- |
| U-01 | What does Orange mean by 85–90% AI?                                           | KPI design, architecture emphasis, challenge scoring | Orange + LUX AI           |
| U-02 | Which Orange Money interfaces and sandbox capabilities are available?         | Payment adapter implementation                       | Orange Liberia            |
| U-03 | Who holds customer funds?                                                     | Ledger design, licensing, reconciliation             | Legal / Orange / LUX AI   |
| U-04 | Which providers, insurers, credit partners, and program sponsors participate? | Directory, programs, eligibility                     | Partnerships              |
| U-05 | Which currencies, fees, limits, and authorization rules apply?                | Funding engine, disclosures                          | Product + compliance      |
| U-06 | Is USSD available through an approved gateway?                                | Channel roadmap                                      | Orange / messaging vendor |
| U-07 | Which data can be used for AI development and evaluation?                     | Training/eval, privacy, HealthTrust roadmap          | Legal + AI eng            |

---

## 4. Integration inventory

| System                       | Status                     | Adapter                  | Replacement point            |
| ---------------------------- | -------------------------- | ------------------------ | ---------------------------- |
| PostgreSQL                   | Active (local/CI)          | `pg` + Drizzle           | `DATABASE_URL`               |
| Object storage               | Dev: local disk            | `ObjectStorageAdapter`   | S3-compatible config         |
| LUX HealthTrust AI           | Sandbox heuristic/fixtures | `AiAdapter`              | Live model endpoint          |
| Orange Money                 | Not connected              | `PaymentAdapter` sandbox | Live Orange APIs when issued |
| SMS / USSD / WhatsApp        | Sandbox log sink           | `MessagingAdapter`       | Approved gateway             |
| Provider verification bureau | None                       | Manual/simulated flags   | Partner feed                 |
| Insurers / credit            | None                       | Out of scope until U-04  | Future adapters              |

---

## 5. Explicit non-claims

- No signed commercial agreement with Orange Liberia is implied by this codebase.
- No regulatory approval is implied.
- No live payment rails are implied when `PAYMENT_ADAPTER=sandbox` or `APP_ENV` ∈ {development, test, demo}.
- No model accuracy, automation rate, or insurance coverage figures are claimed.

---

## 6. Change log

| Date | Change |
| --- | --- | --- |
| 2026-10-08 | Initial register created during Phase 0 foundation |
