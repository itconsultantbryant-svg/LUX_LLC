# HealthWallet Liberia — Architecture Overview

## 1. Shape

Modular **monorepo application** (not microservices):

```
apps/web          React + TypeScript (Vite) — mobile-first UI
apps/api          Node.js + TypeScript (Fastify) — HTTP API, auth, jobs
packages/shared   Shared types, Zod schemas, constants
packages/config   Shared ESLint / TypeScript baselines
```

PostgreSQL is the system of record. Private object storage holds bill documents. Background jobs handle extraction, validation, and reconciliation. Provider adapters isolate Orange Money, messaging, AI models, and partner systems.

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│  apps/web   │────▶│                 apps/api                 │
└─────────────┘     │  identity │ wallets │ bills │ payments   │
                    │  providers│ programs│ AI    │ reporting  │
                    └─────┬───────────┬────────────┬───────────┘
                          │           │            │
                     PostgreSQL   Object store   Job queue
                          │           │            │
                    ┌─────┴───────────┴────────────┴─────┐
                    │ Adapters: AI │ Payments │ Messaging │
                    │ (sandbox labeled until credentials) │
                    └────────────────────────────────────┘
```

---

## 2. Domain modules (API)

| Module          | Responsibility                                            |
| --------------- | --------------------------------------------------------- |
| `identity`      | Users, roles, sessions, consents                          |
| `providers`     | Provider orgs, verification status (non-fabricated)       |
| `wallets`       | Balances, ledger entries, reservations                    |
| `contributions` | Pots, gifts, restrictions                                 |
| `bills`         | Bill submissions, documents, confirmed fields             |
| `validation`    | Deterministic checks + AI output schema validation        |
| `programs`      | Sponsors, eligibility, caps, categories                   |
| `payments`      | Payment intents, adapter calls, receipts                  |
| `notifications` | Outbound message intents                                  |
| `reporting`     | Audit queries, AI involvement metrics                     |
| `ai`            | LUX HealthTrust orchestration, prompts, evidence packages |

Cross-cutting: authz middleware, environment guards, idempotency keys, structured logging (no secrets).

---

## 3. Data and consistency

- **Ledger-first money:** All balance changes are append-only ledger entries; balances are derived or materialised with constraints.
- **Bill lifecycle:** `draft → extracting → extracted → user_review → validated → funding_proposed → awaiting_auth → paying → paid | failed | needs_review`.
- **Idempotency:** Payment and contribution mutations require client idempotency keys.
- **AI outputs:** Stored as versioned artifacts with model/adapter id, evidence refs, confidence, and schema-validation status. Never trusted without Zod (or equivalent) parse.
- **Human review:** Cases enter `needs_review` on low confidence, rule conflict, restriction clash, amount thresholds, or risk signals.

---

## 4. Adapters

| Port                       | Sandbox behavior                                                                                             | Live replacement point                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `AiAdapter`                | Deterministic document reader (text/plain, FlateDecode PDF) with per-field evidence; never fabricates values | Real model provider under LUX HealthTrust |
| `PaymentAdapter`           | Simulated Orange Money-style intents; labeled                                                                | Confirmed Orange Liberia interfaces       |
| `MessagingAdapter`         | Log / store messages; no external send by default                                                            | Approved SMS/USSD/WhatsApp gateway        |
| `ObjectStorageAdapter`     | Local filesystem in development                                                                              | Private bucket (S3-compatible)            |
| `ProviderDirectoryAdapter` | Seed data marked simulated                                                                                   | Partner-verified directory feeds          |

All adapter responses include `mode: "sandbox" | "live"` and must not silently claim live settlement in demo/development/test.

---

## 5. AI architecture (LUX HealthTrust)

1. **Ingest:** Document stored; job enqueued.
2. **Extract:** Adapter returns structured fields + evidence spans + confidence.
3. **Validate schema:** Reject/repair malformed AI JSON via structured validation.
4. **Deterministic validation:** Arithmetic, currency, required fields, provider match.
5. **Funding assist:** AI may rank sources; **funding math is deterministic**.
6. **Reviewer packet:** Summaries cite bill id, evidence, rule ids.
7. **Metrics:** Record `ai_involved`, `human_review_required`, reason codes — separately.

Orange 85–90% AI remains an **unresolved definition**; instrumentation must support multiple interpretations once confirmed.

---

## 6. Frontend architecture

- Route-based screens aligned to [SCREEN_INVENTORY.md](./SCREEN_INVENTORY.md).
- Design tokens for HealthWallet Liberia brand; LUX HealthTrust named as AI engine.
- Prefer progressive disclosure; minimize bytes (compressed images, sparse home).
- Never embed API secrets; use HTTP-only session or short-lived tokens from API.

---

## 7. Configuration and environments

| Variable area       | Examples                                          |
| ------------------- | ------------------------------------------------- |
| `APP_ENV`           | `development` \| `test` \| `demo` \| `production` |
| `DATABASE_URL`      | PostgreSQL connection                             |
| `STORAGE_*`         | Object storage                                    |
| `AI_ADAPTER`        | `sandbox` \| `live`                               |
| `PAYMENT_ADAPTER`   | `sandbox` \| `live`                               |
| `MESSAGING_ADAPTER` | `sandbox` \| `live`                               |

Production live adapters require explicit config; defaults favor sandbox outside production.

---

## 8. Security baseline

- Server-side permission checks per [ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md).
- Private documents via signed URLs or authenticated streaming; no public buckets.
- Secrets only in environment / secret manager.
- Audit log for payment auth, review decisions, role changes, adapter mode changes.

---

## 9. Testing strategy

- Unit: funding math, permission checks, AI output schema validation.
- Integration: API + database migrations; sandbox adapters.
- Journey checks: main healthcare-payment path against acceptance criteria.
- CI: format, lint, typecheck, unit/integration tests, build.

---

## 10. What we deliberately defer

- Multi-service deploy topology.
- Live Orange credentials and USSD gateway.
- Claiming regulatory approval or custody model.
- Invented accuracy or automation percentages.
