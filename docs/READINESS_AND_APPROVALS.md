# Readiness and approvals

This document exists to keep two very different questions separate:

1. **Is the software technically ready?** (engineering evidence, reproducible)
2. **Are we approved to use it with real funds and real personal data?**
   (business, legal, and partner decisions)

The answer to (1) is **yes, for a labelled demo and supervised pilot**. The
answer to (2) is **no, not yet** — and nothing in this repository should be read
as approval. A green technical board is not permission to handle real money or
real people's health data.

## Part 1 — Technical readiness

Evidence-backed. Each item is reproducible with the commands shown.

| #    | Capability                                    | Evidence                                                                  | Status |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| T-01 | Builds, lints, typechecks, tests              | `pnpm check` (format, lint, typecheck, unit + web tests, build)           | ✅     |
| T-02 | Automated evaluation of AI routing            | `pnpm test:evaluation` → `docs/evaluation/latest.md`                      | ✅     |
| T-03 | End-to-end journey (payment, receipt, replay) | `pnpm test:journey` → `docs/evaluation/journey.md`                        | ✅     |
| T-04 | Authorization isolation (app-layer)           | `pnpm test:security` (AC-SEC-01..05)                                      | ✅     |
| T-05 | Financial integrity (double-entry ledger)     | `pnpm test:ledger`, `pnpm test:funding`                                   | ✅     |
| T-06 | Kill switches fail closed                     | `pnpm test:security` (AC-SEC-04)                                          | ✅     |
| T-07 | Backup produces a restorable dump             | `pnpm db:backup` + verified restore (see below)                           | ✅     |
| T-08 | Verified restore                              | drill 2026-10-15: 75/75 tables + row parity (`BACKUP_AND_ROLLBACK.md` §3) | ✅     |
| T-09 | Labelled demo runs end to end                 | `pnpm demo:local` → `deploy/verify-demo.mjs` 12/12 checks                 | ✅     |
| T-10 | Health and readiness checks                   | `GET /health`, `GET /ready`                                               | ✅     |
| T-11 | Deployment config (Vercel services)           | `vercel.json` (`api` + `web`), `docs/DEPLOYMENT.md`                       | ✅     |
| T-12 | Monitoring and incident response defined      | `docs/MONITORING.md`, `docs/INCIDENT_RESPONSE.md`                         | ✅     |
| T-13 | Production config preflight                   | `APP_ENV=production pnpm deploy:check`                                    | ✅     |

### Known technical gaps (do not round up)

- **T-GAP-01 — Row-level security (RLS) is not enabled.** Isolation is
  application-layer only ([SECURITY_HARDENING.md](./SECURITY_HARDENING.md) open
  items). Acceptable for a supervised pilot; revisit before broad rollout.
- **T-GAP-02 — Live adapters are not connected.** AI, payments, messaging, and
  storage run sandbox by default; live payment/Twilio paths require partner
  credentials ([ASSUMPTIONS_AND_INTEGRATIONS.md](./ASSUMPTIONS_AND_INTEGRATIONS.md) §4).
- **T-GAP-03 — Evaluation dataset is small and synthetic.** Results prove the
  controls, not field accuracy (see [EVALUATION.md](./EVALUATION.md) limitations).
- **T-GAP-04 — Cloud deploy is prepared but not executed here** (no cloud
  credentials in this environment). The local demo is the verified artifact.

## Part 2 — Approvals required before real funds or personal data

These cannot be satisfied by code. Each needs a named owner and a dated decision.

| #    | Approval                                                   | Blocks                  | Owner                     | Status |
| ---- | ---------------------------------------------------------- | ----------------------- | ------------------------- | ------ |
| A-01 | **Fund custody agreed** (who holds customer money) — U-03  | Any real payment        | Legal / Orange / LUX AI   | ❌     |
| A-02 | Orange Money integration terms and interface access — U-02 | Live payments           | Orange Liberia            | ❌     |
| A-03 | Definition of Orange's "85–90% AI" KPI — U-01              | Success measurement     | Orange + LUX AI           | ❌     |
| A-04 | Data-protection basis for real personal/health data — U-07 | Phase B (real PII)      | Legal / DPO               | ❌     |
| A-05 | Fees, limits, currencies, authorization rules — U-05       | Real checkout           | Product + Compliance      | ❌     |
| A-06 | Participating providers, sponsors, partners — U-04         | Real directory/programs | Partnerships              | ❌     |
| A-07 | USSD gateway approval (if in scope) — U-06                 | USSD channel            | Orange / messaging vendor | ❌     |
| A-08 | Regulatory/licensing position confirmed                    | Real-money operation    | Legal                     | ❌     |
| A-09 | Signed partner agreements where required                   | Any live integration    | LUX AI / partners         | ❌     |
| A-10 | Named incident contacts and notification windows           | Pilot go-live           | LUX AI ops / partners     | ❌     |

## Part 3 — What each environment is allowed to do

| Environment          | Personal data         | Real funds | Allowed now?         |
| -------------------- | --------------------- | ---------- | -------------------- |
| Demo (labelled)      | none (synthetic only) | none       | **Yes**              |
| Supervised pilot (A) | none (synthetic only) | none       | **Yes**              |
| Controlled pilot (B) | limited, consented    | none       | Not until A-04, A-10 |
| Live funds (C)       | consented             | real       | Not until A-01…A-09  |

## Part 4 — Gate decision

A phase may start only when **all** of its technical prerequisites (Part 1) and
its approvals (Part 2) are met. The software being ready (Part 1) is necessary
but not sufficient.

**Recommendation:** proceed with the labelled demo and supervised pilot now.
Treat the controlled pilot as blocked on A-04 and A-10, and any real-money
activity as blocked on A-01, A-02, and A-08.

## Sign-off

| Role                  | Name | Decision | Date |
| --------------------- | ---- | -------- | ---- |
| Engineering lead      |      |          |      |
| Product owner         |      |          |      |
| Legal / compliance    |      |          |      |
| Data protection (DPO) |      |          |      |
| Partner (Orange)      |      |          |      |
