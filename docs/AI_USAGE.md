# How AI (LUX HealthTrust) is used in HealthWallet Liberia

This document explains, honestly and from the code, everywhere AI participates in
the product, what it is never allowed to do, how its output is measured, and how the
platform is being moved toward an **AI-first** operating model where AI handles the
large majority of routine work — with humans kept in the loop for safety.

> Current reality: the only `AiAdapter` implementation today is a **deterministic,
> rule-based reader** (id `reader:rules-v1`). There is **no live model** in this
> repository, and the code fails closed if `AI_ADAPTER=live`. The pipeline, contracts,
> storage, review surface, metrics, and safety gates are all built and tested; swapping
> in a live LUX HealthTrust model is an adapter change, not a rewrite.

---

## 1. Where AI sits in the money journey

```
 bill uploaded ─▶ [AI] read + extract fields (with per-field evidence)
                      │
                      ▼
                 deterministic coherence checks (arithmetic, mismatches, confidence)
                      │
                      ▼
 human review queue (if uncertain / unreadable / low confidence)
                      │
                      ▼
            [AI] compare document vs bill   ──▶  hybrid validation
            deterministic checks                 (rules + AI + external records)
            verified external records
                      │
                      ▼
            approved policy decides the route  ──▶ auto_accept / await_review / …
                      │
                      ▼
          deterministic funding engine (NO AI) ─▶ reserve eligible funds
                      │
                      ▼
          human-gated, deterministic payment authorization (NO AI)
```

AI is deliberately concentrated at the **reading, comparing, and explaining** steps.
Everything that **moves money** stays deterministic and, in production, is gated by a
provider callback.

---

## 2. The AI contract

`apps/api/src/adapters/types.ts` defines the whole AI surface:

```ts
export interface AiAdapter {
  readonly id: string;
  readonly mode: AdapterMode; // 'sandbox' | 'live'
  extractFromDocument(input: {
    storageKey: string;
    contentType: string;
    bytes?: Buffer; // adapters must read the document itself, never a fixture
    hintText?: string;
  }): Promise<AiExtractionResult>;
}
```

Key properties enforced everywhere:

- **One job:** read a document and return structured fields. There is no "chat"
  method, no free-form answer, no tool execution.
- **Typed output.** `AiExtractionResultSchema` (in `packages/shared/src/bill.ts`) is
  parsed with Zod on every return (`modules/extraction/service.ts`). A model cannot
  return unvalidated text.
- **Evidence required.** Every field carries evidence (`page`, `quote`, `textSpan`)
  so a reviewer can see _why_ a value was extracted.
- **No fabrication.** Unreadable documents return an empty, `unreadable: true` result;
  the bill routes to human assistance rather than guessing.

### The sandbox reader (`apps/api/src/adapters/ai.sandbox.ts`)

`SandboxAiAdapter` (`id: 'lux-healthtrust.ai.sandbox'`, `modelOrFixture: 'reader:rules-v1'`):

1. `modules/extraction/parse.ts` turns bytes into page-ordered text: UTF-8 text,
   FlateDecode PDF content streams (`(...)Tj` / `[...]TJ`). Images with no OCR and
   unknown types are explicitly `unreadable`.
2. `modules/extraction/heuristic.ts` extracts provider, customer, bill reference,
   date, currency, total, and line items with regex/rule matching, flags ambiguous or
   multiple totals, flags unsupported currencies, and records instruction-like text
   as **untrusted evidence**.
3. Confidence is a deterministic field-coverage ratio, not a model probability.
4. Totals are re-derived by trusted arithmetic over line items (`derivedTotalMinor`);
   the model is never the source of a total.

This is why the sandbox is safe to demo: it can only report what is actually in the
bytes.

---

## 3. Component-by-component

| Component          | File(s)                                        | AI role                                                                                                                |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Extraction runtime | `apps/api/src/modules/extraction/service.ts`   | Runs the adapter, scores findings against the `0.75` review threshold, persists runs/artifacts/findings, enqueues jobs |
| Document reading   | `apps/api/src/modules/extraction/parse.ts`     | Text/PDF stream reading; explicit `unreadable` reasons                                                                 |
| Field heuristics   | `apps/api/src/modules/extraction/heuristic.ts` | Rule extraction + evidence + injection detection (records, never obeys)                                                |
| Hybrid validation  | `apps/api/src/modules/validation/*`            | 12 checks; two are AI-sourced, one external (placeholder), the rest deterministic                                      |
| Funding assistance | `apps/api/src/modules/assistance/*`            | **No AI.** Fully deterministic eligibility; AI may only explain a computed plan                                        |
| Grounded assistant | `apps/api/src/modules/assistant/service.ts`    | **No model.** Deterministic templates grounded in authorized records                                                   |
| Evaluation         | `apps/api/src/evaluation/*`                    | Runs the real pipeline; computes metrics with explicit denominators                                                    |

### The two AI checks in validation

- `checkDocumentConsistency` (`modules/validation/checks.ts`) compares the stored
  extraction against the billing revision. Conflicts are `fail`; missing AI output is
  `unavailable`. Every result carries the `AI_LIMITATION_NOTE`.
- `checkAiDocumentAnalysis` synthesizes confidence, unreadable, ambiguous, and
  untrusted-document signals. Untrusted in-document instructions are treated as
  potential fraud and block auto-accept.

The route is decided by an **approved policy**, not by the model. `decideRoute` takes
the safest outcome and any high-risk/conflicting/uncertain finding prevents
auto-accept (`packages/shared/src/validation.ts`).

### The assistant is not a model

`AssistantService.ask` answers six grounded tools (`explain_bill_status`,
`explain_funding_sources`, `find_providers`, `explain_fees`, `navigate`,
`prepare_support_request`) by reading authorized records and formatting them.
`generatedBy` is always `'deterministic'`. Consequential actions are only **prepared**
and require an explicit, separately verified confirmation.

---

## 4. What AI is never allowed to do

These are enforced in code, not just policy:

- **Never authorizes money.** Only a deterministic policy route plus a provider
  callback can settle a payment. `AI findings can never authorize payment`
  (`packages/shared/src/validation.ts`).
- **Never declares that treatment occurred.** `AI_LIMITATION_NOTE` and a hard-coded
  `treatmentOccurredConclusion: false` say so (`modules/validation/checks.ts`).
- **Never fabricates.** Unreadable/absent values are `null` with a finding, never
  guessed (`ai.sandbox.ts`, `heuristic.ts`, `extraction/service.ts`).
- **Never acts on in-document instructions.** Prompt-injection text is recorded as
  untrusted evidence only.
- **Never invents coverage or balances.** The assistance engine reports insurance only
  from verified records, never inferred from uploaded documents.
- **Fails closed.** `AI_ADAPTER=live` without a configured model throws at startup;
  `ai_runs.requires_review` defaults to `true`; an invalid stored policy falls back to
  the built-in approved policy rather than "accept everything".

---

## 5. Where AI output is stored and audited

Migration-backed tables (`apps/api/src/db/schema.ts`):

- `ai_runs` — one row per extraction (mode, adapter, model version, confidence,
  `requires_review`, output JSON, input digest).
- `ai_artifacts` — workflow-level artifact with `human_review_required`.
- `validation_findings` — findings linked to a run.
- `extraction_corrections` — append-only human corrections preserving original and
  corrected values.
- `validation_results` — one row per check, tagged `deterministic | ai | external`.
- `validation_reviewer_actions` — immutable reasoned human decisions.
- `assistant_confirmations` — prepared/confirmed assistant actions.

HTTP surface (AI-relevant):

| Endpoint                                                          | Purpose                                          |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `POST /api/bills/:id/extract`                                     | Runs extraction (calls the AI adapter)           |
| `GET /api/care/bills/:id/extraction`                              | Customer/provider view of the extracted result   |
| `POST /api/care/bills/:id/extraction-review`                      | Human corrections                                |
| `POST /api/bills/:id/validate`                                    | Hybrid validation (consumes stored AI output)    |
| `GET /api/admin/reviews`, `POST /api/admin/reviews/:id/:decision` | Human review queue                               |
| `GET /api/admin/metrics`                                          | Runs/review counts and journey metrics           |
| `POST /api/assistant/ask`, `POST /api/assistant/confirm`          | Grounded assistant                               |
| `POST /api/ai/sandbox-extract`                                    | Demo-only sandbox extraction (404 in production) |

---

## 6. How AI quality is measured

`apps/api/src/evaluation/*` runs the **real** pipeline (real adapter, real ledger,
real review gates — nothing bypasses financial or review controls) over a labeled
synthetic dataset: 11 extraction cases and 7 validation scenarios, plus a
journey-to-receipt integration suite.

The latest report (`docs/evaluation/latest.md`) reports every number with its
numerator and denominator:

- Extraction accuracy across labeled critical fields: **1.000 (39/39)**.
- Uncertain/unreadable cases routed to a person: **1.000 (3/3)**.
- Missed suspicious cases: **0.000 (0/15)**.
- Incorrect automated outcomes: **0.000 (0/3)**.
- Human-review workload (extraction layer): **0.818 (9/11)** — high by design; the
  suite treats suppressing necessary review as a failure.
- Workflows involving AI: **0.611 (11/18)**.
- `reviewNotSuppressed`: **yes** (a hard guardrail).

Reproduce with `pnpm test:evaluation` against an isolated `_test` database.

---

## 7. The AI-first goal: AI handling ~90% of the work

**Goal.** AI should autonomously handle the large majority of routine work in the
platform — reading documents, populating bills, running checks, drafting the customer's
next best action, matching funding sources, and answering support questions — while
humans supervise only genuinely uncertain, high-value, or adversarial cases.

**The goal is a rate with a denominator, never a slogan.** "AI handles X%" is only
meaningful as `(workflows completed without a human) / (all eligible workflows)` under
the approved policy. The platform already computes this:

- `automationEligible` — eligible cases processed without manual review.
- `automationAll` — all cases processed without review (includes ones that _should_
  have been reviewed, so it is penalized when review is skipped).
- `escalationRate` — scenarios routed to human review.
- `reviewNotSuppressed` — the guardrail that prevents "automation" by ignoring risk.

**Honest baseline today:** the sandbox reader reaches 100% of _eligible_ cases without
review (`2/2`) but only `18.2%` of _all_ extraction cases, because most test cases are
intentionally uncertain/adversarial and correctly escalate. The Orange "85–90% AI"
figure remains an **unresolved partner definition** (`docs/ASSUMPTIONS_AND_INTEGRATIONS.md`);
we do not adopt it as a KPI until it is defined and measurable.

**Roadmap to raise the automation rate safely:**

1. **Live reader.** Replace `SandboxAiAdapter` with the LUX HealthTrust model behind the
   same `AiAdapter` contract, including OCR for images. Confidence becomes model-derived
   but still Zod-validated and evidence-backed.
2. **Reference datasets.** Populate `price_references` and insurance datasets so
   `checkPriceAnomaly` / `checkCoverageEligibility` return real verdicts instead of
   `unavailable`.
3. **Assisted review.** Let AI pre-draft review decisions and customer explanations
   (the defined-but-unused `AssistanceExplanationSchema`) so human reviewers confirm
   rather than compose.
4. **Conversational assistant.** Keep the grounded assistant deterministic, but add an
   LLM phrasing layer constrained to authorized records (`generatedBy: 'assistant'`),
   with the same no-fabrication guarantees.
5. **Tune thresholds against data.** Raise auto-accept coverage only where measured
   false-negative rates stay at zero; never by relaxing the guardrails.
6. **Measure continuously.** Track `automationEligible` and `reviewNotSuppressed` per
   release as the primary AI-first KPIs.

The invariant that must never move: **increasing automation must not increase missed
suspicious cases.** Necessary review is never suppressed to make a number look better.

---

## 8. Configuration and swapping in a live model

| Variable                     | Meaning                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `AI_ADAPTER`                 | `sandbox` (default) or `live`. `live` currently throws until a model is configured. |
| `RETENTION_AI_ARTIFACT_DAYS` | Retention window for AI artifacts (default 365).                                    |

To go live: implement a real adapter against `AiAdapter`, register it in
`apps/api/src/adapters/index.ts`, keep returning `AiExtractionResult`, and the entire
pipeline (scoring, review, validation, metrics, audit) works unchanged.

---

## 9. File map

| Concern                  | Path                                                                            |
| ------------------------ | ------------------------------------------------------------------------------- |
| AI contract              | `apps/api/src/adapters/types.ts`, `packages/shared/src/bill.ts`                 |
| Sandbox reader           | `apps/api/src/adapters/ai.sandbox.ts`                                           |
| Parsing / heuristics     | `apps/api/src/modules/extraction/parse.ts`, `heuristic.ts`                      |
| Extraction runtime       | `apps/api/src/modules/extraction/service.ts`                                    |
| Hybrid validation        | `apps/api/src/modules/validation/{engine,checks,context,policy,review}.ts`      |
| Validation contract      | `packages/shared/src/validation.ts`                                             |
| Deterministic assistance | `apps/api/src/modules/assistance/*`, `packages/shared/src/assistance.ts`        |
| Grounded assistant       | `apps/api/src/modules/assistant/service.ts`, `packages/shared/src/assistant.ts` |
| Evaluation + metrics     | `apps/api/src/evaluation/*`, `docs/evaluation/latest.md`                        |
| Persistence              | `apps/api/src/db/schema.ts`                                                     |
| Product walkthrough      | `apps/web/src/pages/JourneyPage.tsx`, `docs/EVALUATION.md`                      |
