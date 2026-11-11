# AI safety and evaluation notes

The current AI adapter is a deterministic demonstration, not an actual language-model service. It returns a schema-validated empty findings list; deterministic database-backed rules produce meaningful completeness, coverage, tariff and possible-duplicate findings. No confidence score is fabricated.

The initial pilot **always routes to a human insurer reviewer**. AI cannot approve/reject claims, prescribe treatment, alter balances, invoke payment tools or fetch arbitrary URLs. Document contents are not executed or interpreted as system policies. There is no configured OCR/extraction provider; image/PDF extraction must not be advertised as integrated.

Validation records store submission version, rules/model version, timestamps, findings and processing errors. A failed AI adapter leaves the claim for human review, not rejection. Evidence points to a submitted item, eligibility snapshot or tariff. “Possible duplicate” is not “fraud.”

## Executed tests

- Malformed structured results and fabricated action properties are rejected by the output schema.
- Confidence outside 0–1 is rejected; deterministic findings use null confidence.
- Validation cannot transition directly from VALIDATING to APPROVED or REJECTED.
- Role permissions deny facility/provider financial and insurer decision operations.

## Required before optional model integration

1. Approve data processor/retention/region and minimum necessary document scope.
2. Add an explicit server-only provider adapter with timeouts and strict structured-output validation.
3. Build synthetic adversarial documents containing “ignore policy,” fake tool instructions, requests for another tenant’s records and fake payment confirmations. Confirm outputs cannot access tools or cross-record retrieval.
4. Evaluate unsupported assertions, missing evidence, low-confidence extraction, malformed outputs and provider outages. Low-confidence or unsupported findings go to humans.
5. Record model/provider version and evaluation thresholds; do not log raw clinical prompts.
6. Auto-approval stays disabled. Any future rules-based auto-approval requires separate organization enablement, tested caps/exclusions, audit sampling and a pause switch.
