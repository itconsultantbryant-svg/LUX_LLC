# Data dictionary

All identifiers are UUIDs except Better Auth’s opaque text IDs. `*_minor` is an integer amount, stored as PostgreSQL `bigint` and serialized as a string. Currency is explicit. Timestamps are UTC `timestamptz`; UI formats Africa/Monrovia. No patient name is used as a unique key.

| Group          | Tables and responsibilities                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity       | `user`, `account`, `session`, `verification`, `twoFactor`, `rateLimit`: maintained Better Auth credentials, sessions, one-time verification, encrypted TOTP and lockout state                                                           |
| Organizations  | `organizations`, `memberships`, `invitations`, `organization_requests`, `enquiries`: active membership context; requests cannot self-activate tenants                                                                                   |
| Relationships  | `facility_insurer_contracts`: dated facility–insurer relationship and required document types; `wallet_destinations`, `destination_changes`: versioned verified destination and separate maker/checker                                  |
| Clinical       | `patients`, `patient_corrections`, `insurer_patient_references`, `eligibility_snapshots`: minimum identity, provenance and insurer reference; `encounters`, `encounter_versions`: diagnosis, notes and structured prescription array    |
| Claims         | `claim_drafts`: actor-scoped autosaved preparation; `claims`: current state and totals; `claim_items`: working bill; `claim_versions`: immutable submitted snapshot                                                                     |
| Evidence       | `attachments`: random private object key, declared/actual size/type, hash and quarantine/scan state; clean bytes are promoted to a new server-only key                                                                                  |
| Policy         | `tariff_sets`, `tariff_items`, `coverage_rulesets`: effective dated local pilot code/tariff versions and organization rules                                                                                                             |
| Review         | `validation_runs`, `findings`, `review_assignments`, `decisions`, `appeals`: input/rules/model version, findings/evidence, human decision and separate appeal history                                                                   |
| Payments       | `payments`, `payment_authorizations`, `payment_attempts`, `claim_payment_allocations`, `provider_events`: snapshotted destination/policy, identities, durable attempt, payable reservations and verified evidence                       |
| Fees           | `fee_policies`, `fee_assessments`, `ledger_entries`, `fee_settlement_records`: versioned incidence, one final assessment per settlement, compensating accounting, independently verified cash allocation                                |
| Reconciliation | `reconciliation_runs`, `reconciliation_items`, `reconciliation_resolutions`: file checksum, staged rows, exact-reference comparison and append-only resolution evidence                                                                 |
| Operations     | `notifications`, `support_tickets`, `support_access`, `audit_events`, `outbox_events`, `idempotency_commands`, `rate_limits`: in-app updates, approved access schema, immutable audit, durable jobs, command replay, public spam limits |
| Content        | `public_pages`, `team_members`, `partner_entries`, `media_assets`: versioned structured copy, approved team details, publication permission and provenance/focal metadata                                                               |
| Integration    | `integration_configurations`: nonsecret mode/capability metadata only; no API keys or PINs                                                                                                                                              |

Diagnoses are stored on the versioned encounter; prescriptions are structured validated JSON entries (name, strength, dose, route, frequency, duration, quantity), not separate tables in this pilot. This deliberate schema consolidation does not implement prescribing recommendations.

## Integrity

- Provider event IDs, external provider references, attempt keys and final payment fee assessments are unique.
- Command idempotency keys are scoped to organization **and actor**, use canonical payload fingerprints and serialize concurrent replay through an advisory lock.
- Claim row locks serialize payable reservations. Reserved + confirmed allocations cannot exceed approved principal through the authorization service.
- DB triggers prohibit mutation/deletion of submitted versions, decisions, ledger entries, provider evidence, assessed fees and audit events. Migration owner credentials must not be application credentials in production.
- No financial or audit record has cascade deletion. Retention jobs are not enabled without an approved retention policy.
- Queue and membership indexes, facility/insurer claim indexes, unique reconciliation checksums and payment status indexes support primary task paths.
- SQL migrations are checksummed. Applied migrations must not be edited; add a new numbered migration.
