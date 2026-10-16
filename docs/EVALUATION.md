# Evaluation Suite

Product: **HealthWallet Liberia** · AI: **LUX HealthTrust**

This suite measures how well the platform performs its safety-critical work:
extracting bill fields, validating them deterministically, routing uncertainty to
a person, paying providers reliably, and letting a user finish a real task on a
phone with a weak connection.

It exists to answer one question honestly: **does the system work, and where
does it not?** Every number it prints is a ratio with a stated numerator and
denominator. A value is never shown without the population it was measured
against, and nothing in this suite may imply live money movement or live
accuracy.

## Scope and honesty rules

- **Sandbox only.** The suite runs against the sandbox AI adapter and sandbox
  storage in `APP_ENV=test`. No real money moves, no partner is contacted, and
  no real person's data is used.
- **Synthetic, labelled data.** Inputs come from `evaluation-v1` and
  `journey-v1` fixtures with known ground truth. Accuracy is measured against
  that ground truth, not against a claim.
- **AI explains; it never decides money.** A verified provider callback is the
  only thing that can settle a payment. AI never authorizes payment.
- **No fabricated success.** A missing comparison dataset is reported as
  `unavailable`, never as a pass, and never as a failure.
- **Necessary review is never suppressed.** Optimizing automation at the cost of
  a missed suspicious case fails the suite (see the report's
  `Necessary review not suppressed` line).

## What is measured

Two database-backed suites plus two pure unit/behaviour suites.

### 1. Extraction and validation — `evaluation-v1`

Runs the real extraction and validation pipeline over seeded bills and writes
`docs/evaluation/latest.{json,md}`.

- Extraction cases: **11** — clean printed and itemized bills, line/total
  arithmetic mismatch, missing total/currency, currency mismatch, unsupported
  currency, provider mismatch, unreadable document, two-total ambiguity,
  untrusted in-document instructions, and low-confidence partials.
- Validation scenarios: **7** — clean baseline, arithmetic mismatch, exact
  duplicate, near duplicate, unverified provider, insufficient funding, and
  restricted funding.

Reported metrics (each with an explicit denominator):

| Metric                                                                                 | Numerator / denominator                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| Extraction accuracy — all labelled critical fields                                     | correct fields / labelled fields             |
| Extraction accuracy — per field (provider, customer, reference, date, currency, total) | correct / cases labelling that field         |
| Exact-duplicate detection                                                              | detected / seeded exact duplicates           |
| Near-duplicate detection                                                               | detected / seeded near duplicates            |
| Arithmetic validation detection                                                        | detected / seeded arithmetic cases           |
| Unverified-provider detection                                                          | detected / seeded provider cases             |
| Insufficient-funding detection                                                         | detected / seeded funding cases              |
| Funding-restriction detection                                                          | detected / seeded restriction cases          |
| Routing agreement with approved policy                                                 | matching route / all scenarios               |
| Cases escalated to human review (validation)                                           | routed to `await_review` / all scenarios     |
| Incorrectly flagged clean cases (false positives)                                      | clean-but-reviewed / clean cases             |
| Missed suspicious cases (false negatives)                                              | missed / all suspicious cases                |
| Uncertain cases routed to a person                                                     | reviewed / uncertain cases                   |
| Human-review workload (extraction)                                                     | reviewed / all extraction cases              |
| Eligible cases processed without review                                                | unreviewed / clean cases                     |
| All cases processed without review                                                     | unreviewed / all extraction cases            |
| Incorrect automated outcomes                                                           | wrong auto-passes / all human-free decisions |
| Workflows involving AI                                                                 | AI-involving / all workflows                 |
| AI extraction latency — p50 / p95                                                      | wall-clock ms / AI-involving cases           |

### 2. End-to-end payment and task journeys — `journey-v1`

Drives the **real HTTP stack** (`buildApp`, sessions, routes) through complete
customer journeys and writes `docs/evaluation/journey.{json,md}`.

Seeded tasks (8): validate a clean bill, pay it end-to-end, recover from a
replayed callback, keep a provider-declined payment failed and unmoved, block an
underfunded bill, route a suspected duplicate to a person, await an unverified
provider, and route an unreadable document to a person without inventing values.

Reported metrics:

| Metric                                 | Numerator / denominator                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| Payment reliability                    | attempted payments that succeeded with a receipt / attempted |
| Repeated-callback recovery             | replayed callbacks that changed nothing / attempted          |
| Receipts issued for succeeded payments | receipts / succeeded payments                                |
| User task completion                   | tasks reaching the expected outcome / seeded tasks           |

### 3. Pure unit suites — no database

- `packages/shared/src/payments.test.ts` — exhaustive payment state machine:
  every one of the 81 state pairs is checked against the approved transition
  table, no self-transitions, terminal states are absorbing, a late success may
  only reconcile a failed/expired attempt, and a refund may only reverse a
  succeeded payment.
- `packages/shared/src/routing.test.ts` — rule-trigger predicate, severity
  gating, route precedence (`decline` › `await_review` › `await_provider` ›
  `needs_correction` › `auto_accept`), and overall result precedence.
- `apps/api/src/evaluation/metrics.test.ts` — each metric's numerator and
  denominator computed from synthetic observations.

### 4. Web usability and weak-connectivity — no database

`apps/web/src/usability.test.tsx` renders the primary screen and asserts the
properties that make it usable on a phone and with assistive technology:

- responsive viewport (`width=device-width`, `viewport-fit=cover`) and a document
  language,
- small-screen (`max-width: 820px`) layout rules and `prefers-reduced-motion`
  support,
- a skip link, a focusable `main` landmark, and labelled primary/secondary nav,
- error and loading feedback announced to screen readers, and
- a recoverable offline notice with retry guidance when the device is offline.

The request layer (`apps/web/src/lib/api.ts`) fails with a connection message
that tells the user to check status before retrying a possibly-submitted
request — never a fabricated success.

## How to run

```bash
# Extraction + validation, writes docs/evaluation/latest.{json,md}
pnpm --filter @healthwallet/api test:evaluation

# End-to-end journeys, writes docs/evaluation/journey.{json,md}
pnpm --filter @healthwallet/api test:journey

# Pure unit + web behaviour suites
pnpm --filter @healthwallet/shared test
pnpm --filter @healthwallet/web test
```

The two database suites require the isolated test database
(`.../healthwallet_test`); the scripts set `APP_ENV=test`, point
`DATABASE_URL` at `_test`, and set `EVALUATION_DATABASE_TESTS=1` /
`JOURNEY_DATABASE_TESTS=1`. **Run database suites one file at a time** — they
replay migrations into a fresh schema and parallel runs exhaust connections.

## Separating AI from no-review (AC-11)

`Workflows involving AI` and `All cases processed without manual review` are
reported as **separate** measures. Neither is presented as the Orange 85–90%
automation figure. That figure remains unresolved (backlog U-01) until a live
methodology is agreed and documented; nothing here asserts it.

## Limitations (read before quoting any number)

- **Small, synthetic samples.** Denominators are in the low tens at most, so
  rates are indicative, not statistically strong. Treat a 1.000 as "no failure
  in these fixtures", not "proven".
- **Sandbox adapters only.** Latency is the sandbox AI adapter's wall-clock time,
  not a production model's. Payments never touch a real provider.
- **No live partner or custody data.** Live Orange adapter, settlement, and
  custody questions (U-02, U-03) are out of scope and unresolved.
- **Ground truth is authored, not adjudicated.** Expected values were written
  with the fixtures; they are internally consistent but not clinically or
  financially certified.
- **Usability is static-render only.** The web checks use server rendering and
  cannot observe real tap targets, scrolling, orientation changes, or assistive
  technology in a browser. Browser-driven (Playwright) checks are not yet wired
  up despite the dependency being present in `node_modules`.
- **Latency excludes human review time.** p50/p95 cover the AI call only; the
  time a reviewer takes is not modelled here.
- **Single currency per scenario.** Cross-currency and FX edge cases are not yet
  seeded.
- **Locale and network variety.** Only English copy and a single offline/online
  toggle are exercised; low-bandwidth partial delivery is not simulated.

Every limitation above is a candidate for a future scenario. Until then, no
report from this suite may be used to claim live accuracy, coverage, or
settlement.
