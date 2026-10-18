# LUX evaluation report

- Dataset version: `journey-v1`
- Generated: 2026-10-18T13:28:41.138Z
- Cases: 0 extraction, 0 validation scenarios, 1 payments, 8 tasks
- Necessary review not suppressed: **yes**

Every rate below states its numerator over its denominator. A number is never reported without a known denominator.

| Metric | Value | Unit | Definition |
| --- | --- | --- | --- |
| Payment reliability | 1.000 (1/1) | rate | Attempted payments that reached the succeeded terminal state with a receipt, over all attempted payments. |
| Repeated-callback recovery | 1.000 (1/1) | rate | Attempted payments where a replayed provider callback changed nothing, over all attempted payments. |
| Receipts issued for succeeded payments | 1.000 (1/1) | rate | Succeeded payments that produced a receipt, over all succeeded payments. |
| User task completion | 1.000 (8/8) | rate | Seeded end-to-end user tasks that completed the expected outcome, over all seeded tasks. |

## How to reproduce

`pnpm --filter @healthwallet/api test:journey` (requires the isolated `_test` database and the matching `*_DATABASE_TESTS=1` flag).
