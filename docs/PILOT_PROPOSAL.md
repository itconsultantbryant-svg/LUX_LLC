# Pilot proposal

A proposal for a small, controlled pilot of HealthWallet Liberia with LUX
HealthTrust. It is deliberately scoped so the product can be evaluated with real
people and real workflows **without** touching real funds or sensitive personal
data until the separate approvals in
[READINESS_AND_APPROVALS.md](./READINESS_AND_APPROVALS.md) are in place.

This is a proposal, not an agreement. It contains no commitments on custody,
licensing, or partner terms.

## 1. Objective

Prove that the platform can **read a healthcare bill, route the uncertain cases
to a human, and complete a payment safely and repeatably** — first with synthetic
data, then with a limited supervised pilot — and produce evidence good enough to
decide whether to scale.

## 2. What the pilot is and is not

**Is:**

- A limited deployment to a small number of participating providers and
  customers, in a clearly labelled environment.
- A supervised evaluation of the end-to-end journey, the human-review controls,
  and operations (monitoring, backup/restore, incident response).
- Evidence-gathering with defined measures and honest denominators.

**Is not:**

- A launch, a general-availability product, or a funding commitment.
- A custody arrangement. **Fund custody is unresolved (U-03)**; no real customer
  funds move until it is agreed in writing.
- A claim of regulatory approval, a signed Orange agreement, or partner coverage.

## 3. Phases

| Phase                | Data                             | Money                | Goal                                                            |
| -------------------- | -------------------------------- | -------------------- | --------------------------------------------------------------- |
| A — Supervised demo  | Synthetic only                   | None                 | Confirm the journey and controls with stakeholders in the room. |
| B — Controlled pilot | Limited, consented personal data | None (sandbox rails) | Validate real workflows, usability, and operations.             |
| C — Live-funds pilot | Consented                        | Real, limited caps   | **Only after** the approvals in §7 are complete.                |

Phase A is available today (`pnpm demo:local`). Phase B requires the
data-protection approvals; Phase C requires custody, Orange integration, and
regulatory sign-off.

## 4. Participants and responsibilities

| Party                      | Responsibility                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------ |
| LUX AI (operator)          | Runs the platform, monitoring, incident response, and reporting.                     |
| Participating providers    | Submit and confirm accurate bills; follow the [provider guide](./PROVIDER_GUIDE.md). |
| Program sponsor (optional) | Defines a support program and its eligibility rules.                                 |
| Orange Liberia (intended)  | Payment integration and any custody arrangement (unresolved — U-02, U-03).           |
| Customers / caregivers     | Consent, use the wallet, raise disputes.                                             |
| Support team               | First line per the [customer support guide](./CUSTOMER_SUPPORT_GUIDE.md).            |

## 5. Measures

Success measures are recorded with a numerator and denominator and are not
adjusted after the fact. Baseline engine measurements already exist
(`docs/evaluation/`):

| Measure                                   | Baseline (synthetic, small) | Pilot target                                               |
| ----------------------------------------- | --------------------------- | ---------------------------------------------------------- |
| End-to-end user task completion           | 1.000 (8/8)                 | ≥ 0.90 over ≥ 50 real tasks                                |
| Payment reliability (succeeded + receipt) | 1.000 (1/1)                 | ≥ 0.99 over ≥ 50 real payments                             |
| Necessary review suppressed               | no                          | must remain **no**                                         |
| Uncertain cases routed to a person        | 1.000 (3/3)                 | ≥ 0.95                                                     |
| Extraction accuracy — critical fields     | 1.000 (39/39)               | measured and reported (no target until real-data baseline) |
| Median time to confirm a bill             | not yet measured            | reported per provider                                      |
| Support contacts per 100 journeys         | not yet measured            | reported; trending down                                    |

Operational measures: `/ready` availability, backup age, restore-drill result,
open payment incidents, and stuck `job_queue` count (see
[MONITORING.md](./MONITORING.md)).

## 6. Operations during the pilot

- **Monitoring:** health checks, error monitoring, and job-queue alerts per
  [MONITORING.md](./MONITORING.md).
- **Incidents:** severity levels, containment, and communication per
  [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md). Data-exposure or payment-
  corruption incidents are SEV-1.
- **Backups:** daily, with a quarterly verified restore
  ([BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)).
- **Review cadence:** weekly operational review; end-of-phase review against §5.
- **Rollback:** documented in [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md) §4.

## 7. Dependencies and approvals (must be closed before Phase C)

These are the open questions from the
[assumptions register](./ASSUMPTIONS_AND_INTEGRATIONS.md) §3:

- **U-01** Definition of Orange's "85–90% AI" KPI.
- **U-02** Which Orange Money interfaces and sandbox capabilities are available.
- **U-03** **Who holds customer funds** (custody) — blocking for real money.
- **U-04** Participating providers, insurers, credit partners, sponsors.
- **U-05** Currencies, fees, limits, and authorization rules.
- **U-06** USSD availability through an approved gateway.
- **U-07** Which data may be used for AI development and evaluation.

Plus: signed partner agreements where required, and the technical/approval gates
in [READINESS_AND_APPROVALS.md](./READINESS_AND_APPROVALS.md).

## 8. Data protection

- Phase A: synthetic only, prefixed `SYNTHETIC`, no real people.
- Phase B: explicit, informed consent per data category; minimal necessary data;
  retention per policy; export and deletion supported; the AI data-use question
  (U-07) resolved before any use beyond serving the user.
- No use of pilot data for model training without a separate, explicit agreement.

## 9. Expansion criteria

Move beyond a phase only when its measures are met, its incidents are reviewed,
and its gates are closed. Stop or pause if **necessary review is ever suppressed**
or if a SEV-1 incident is unresolved.

## 10. Decision requested

Approve **Phase A** now (available today), and agree the owners and dates for the
§7 dependencies so **Phase B** can be scheduled. Do not treat this proposal as
authorization to handle real funds or personal data — that requires the separate
gates in [READINESS_AND_APPROVALS.md](./READINESS_AND_APPROVALS.md).
