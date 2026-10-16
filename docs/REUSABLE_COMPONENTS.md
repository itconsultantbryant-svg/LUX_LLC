# Reusable Components Register

Inspected: 2026-10-08 · Repository was otherwise empty.

## Existing assets

| Path                     | Type        | Reuse plan                                                                                                                           |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `assets/LUX_AI_logo.png` | Brand image | Use in web app header/landing for LUX AI / LUX HealthTrust attribution; keep original file; copy or reference from `apps/web/public` |

## Not present (built in Phase 0)

- No prior frontend, backend, migrations, CI, or design system.
- No verified Orange SDKs or credentials in repo (correct; do not add secrets).

## New reusable foundations (created Phase 0)

| Component                       | Location                | Notes                                 |
| ------------------------------- | ----------------------- | ------------------------------------- |
| Shared Zod schemas / role codes | `packages/shared`       | API and web import the same contracts |
| Env schema                      | `apps/api/src/config`   | Validated at boot                     |
| Adapter ports                   | `apps/api/src/adapters` | Sandbox implementations labeled       |
| Design tokens                   | `apps/web/src/styles`   | HealthWallet Liberia visual baseline  |
| Health/ready endpoints          | `apps/api`              | CI and local readiness                |

When adding UI, prefer composing from `apps/web/src/components` rather than one-off styling. Do not preserve architecture that blocks ledger integrity or adapter boundaries.
