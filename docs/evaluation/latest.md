# LUX evaluation report

- Dataset version: `evaluation-v1`
- Generated: 2026-10-15T23:37:26.452Z
- Cases: 11 extraction, 7 validation scenarios, 0 payments, 0 tasks
- Necessary review not suppressed: **yes**

Every rate below states its numerator over its denominator. A number is never reported without a known denominator.

| Metric | Value | Unit | Definition |
| --- | --- | --- | --- |
| Extraction accuracy — all labeled critical fields | 1.000 (39/39) | rate | Correctly extracted critical fields divided by all labeled critical fields across cases. |
| Extraction accuracy — providerName | 1.000 (7/7) | rate | Correctly extracted (including correctly absent) providerName divided by evaluation cases that label providerName. |
| Extraction accuracy — customerName | 1.000 (4/4) | rate | Correctly extracted (including correctly absent) customerName divided by evaluation cases that label customerName. |
| Extraction accuracy — billReference | 1.000 (4/4) | rate | Correctly extracted (including correctly absent) billReference divided by evaluation cases that label billReference. |
| Extraction accuracy — serviceDate | 1.000 (4/4) | rate | Correctly extracted (including correctly absent) serviceDate divided by evaluation cases that label serviceDate. |
| Extraction accuracy — currency | 1.000 (10/10) | rate | Correctly extracted (including correctly absent) currency divided by evaluation cases that label currency. |
| Extraction accuracy — totalAmountMinor | 1.000 (10/10) | rate | Correctly extracted (including correctly absent) totalAmountMinor divided by evaluation cases that label totalAmountMinor. |
| Incorrectly flagged clean cases (false positives) | 0.000 (0/2) | rate | Clean cases (ground truth: no review needed) that were nonetheless routed to review, over all clean cases. |
| Uncertain cases routed to a person | 1.000 (3/3) | rate | Cases classified uncertain (unreadable / ambiguous / low confidence) that required review, over all uncertain cases. |
| Human-review workload (extraction layer) | 0.818 (9/11) | rate | Extraction cases that required human review, over all extraction cases. _(A high workload is not inherently bad; necessary review must never be suppressed.)_ |
| Eligible cases processed without manual review | 1.000 (2/2) | rate | Cases with ground truth "no review needed" that were processed without review, over all such eligible cases. |
| All cases processed without manual review | 0.182 (2/11) | rate | Extraction cases processed without review, over all extraction cases (including ones that should have been reviewed). |
| AI extraction latency — p50 | 1 ms | milliseconds | Median wall-clock duration of AI extraction calls, over all AI-involving extraction cases. |
| AI extraction latency — p95 | 306 ms | milliseconds | 95th-percentile wall-clock duration of AI extraction calls, over all AI-involving extraction cases. |
| Exact-duplicate detection | 1.000 (1/1) | rate | Scenario class "exact_duplicate" detected by the deterministic pipeline divided by all seeded "exact_duplicate" scenarios. |
| Near-duplicate detection | 1.000 (1/1) | rate | Scenario class "near_duplicate" detected by the deterministic pipeline divided by all seeded "near_duplicate" scenarios. |
| Arithmetic validation detection | 1.000 (1/1) | rate | Scenario class "arithmetic" detected by the deterministic pipeline divided by all seeded "arithmetic" scenarios. |
| Unverified-provider detection | 1.000 (1/1) | rate | Scenario class "provider" detected by the deterministic pipeline divided by all seeded "provider" scenarios. |
| Insufficient-funding detection | 1.000 (1/1) | rate | Scenario class "funding" detected by the deterministic pipeline divided by all seeded "funding" scenarios. |
| Funding-restriction detection | 1.000 (1/1) | rate | Scenario class "restriction" detected by the deterministic pipeline divided by all seeded "restriction" scenarios. |
| Routing agreement with approved policy | 1.000 (7/7) | rate | Seeded scenarios whose validation route equals the approved-policy route, over all seeded scenarios. |
| Cases escalated to human review (validation layer) | 0.429 (3/7) | rate | Seeded validation scenarios routed to await_review, over all seeded scenarios. Escalation is not inherently bad; necessary review must never be suppressed. |
| Missed suspicious cases (false negatives) | 0.000 (0/15) | rate | Suspicious cases (ground truth: needs a person) that were neither flagged nor detected, over all suspicious cases. |
| Incorrect automated outcomes | 0.000 (0/3) | rate | Automated (no-human) passes whose ground truth says a person was needed, over all decisions made without a human in the loop. |
| Workflows involving AI | 0.611 (11/18) | rate | Evaluated workflows where an AI adapter participated, over all evaluated workflows. |

## How to reproduce

`pnpm --filter @healthwallet/api test:evaluation` (requires the isolated `_test` database and the matching `*_DATABASE_TESTS=1` flag).
