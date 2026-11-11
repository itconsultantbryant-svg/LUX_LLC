# LUX HealthPay — Product Requirements Document

**Version:** 1.0 · **Date:** 11 November 2026

**Product:** Liberia-first healthcare claims and insurer-to-facility payment coordination

**Release classification:** Synthetic-data demonstration / controlled pilot foundation, not a live financial or clinical service.

## 1. Purpose and problem

Facilities and insurers need a shared, traceable administrative record from coverage verification and care documentation to claim review, payment authorization and reconciliation. Disconnected spreadsheets, unstructured evidence and ambiguous payment statuses make corrections and accountability difficult. LUX HealthPay provides that coordination layer while preserving the insurer's decision and funding authority.

The public website explains the product, the responsibilities of each organization and the limits of the demonstration. The authenticated platform implements scoped administrative workflows. It must never confuse a claim approval, payment instruction, provider acknowledgment or reconciliation record with one another.

## 2. Outcomes and measurement

| Outcome                       | Measurement                                                   | Release acceptance                                                              |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Clear claim records           | Completeness findings and correction count                    | Submitted snapshot, itemized totals and supporting references are reproducible  |
| Accountable decisions         | Reviewer, reason, version and audit history                   | No automated insurer approval; every decision has an authorized human actor     |
| Reliable payment coordination | Time in processing/unknown and reconciliation exception aging | Retry cannot create duplicate financial instructions; ambiguity remains visible |
| Appropriate access            | Cross-organization and role denial tests                      | Unauthorized users cannot retrieve or mutate another organization's records     |
| Accessible discovery          | Public navigation, keyboard and responsive tests              | Public routes, carousel controls and team details work without a mouse          |
| Honest demonstration          | Mode labels, adapter gating and synthetic organizations       | No real funds, real Orange Money PIN collection or fabricated partner claims    |

Baseline and target turnaround/conversion numbers must be agreed with pilot partners after measurement. No unverified success percentages, customer counts or throughput commitments may be published.

## 3. Personas and authority

| Persona                 | Tasks                                                            | Restrictions                                                       |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Facility administrator  | Manage facility staff and organization context                   | Cannot administer insurer staff or decisions                       |
| Facility clinician      | Record encounters and prescriptions                              | Clinical authorship requires clinician permission                  |
| Facility claims officer | Prepare itemized claims, submit evidence and corrections         | Cannot approve its own claims as an insurer                        |
| Facility finance        | Track payments and statements                                    | Cannot authorize insurer spending                                  |
| Insurer reviewer        | Review findings, request information, decide and process appeals | Human decisions; financial maker/checker remains separate          |
| Insurer finance maker   | Reserve approved amounts and prepare authorization               | Cannot check its own payment                                       |
| Insurer finance checker | Independently check payment instructions                         | Must be a different actor; fresh authorization required            |
| LUX platform operator   | Onboarding, CMS, integration/support administration              | Not a substitute for insurer decision/payment authority            |
| LUX finance             | Review earned/accrued fee records and exceptions                 | Fee accrual is not proof of collected cash                         |
| Public visitor          | Learn about the platform and submit an organizational enquiry    | No unrestricted account creation or patient-sensitive enquiry data |

Patients are beneficiaries of better coordination, not wallet holders. A patient-facing account, balance, token or subscription is outside this release.

## 4. Product principles and non-goals

1. Insurers retain claim decisions, payment authorization and funding authority.
2. Orange Money is the intended insurer-to-facility channel. LUX does not custody funds or collect provider PINs.
3. Approved, authorized, processing, settled and reconciled are distinct facts.
4. Tenant scoping, immutable events, exact monetary arithmetic and explicit failure states take precedence over cosmetic success.
5. Automation supports review; deterministic findings are not clinical advice, fraud verdicts or autonomous decisions.
6. Demonstration data, references and payment outcomes are synthetic and labeled.
7. Photography must be genuinely sourced and correctly attributed. Pictured people are not implied customers, employees, partners or actual payment participants.

**Not included:** custodial wallets; patient balances; tokens; subscriptions; live Orange Money transfers without contracted integration; diagnostic/clinical recommendations; guaranteed insurer coverage; fabricated partnerships; autonomous approval; fabricated delivery of mail/SMS.

## 5. Public website requirements

### WEB-01 — Brand and information architecture

Provide Home, Services, How It Works, About, Partners, Team, Get Started, Contact, Privacy, Terms and Accessibility. Preserve the supplied historical LUX artwork without alteration, using adjacent product text where appropriate. Use orange, black and white with restrained navy. Navigation must identify destinations consistently and support mobile menus, keyboard use and visible focus. Historical typo redirects must lead to the intended route.

### WEB-02 — Hero and photographic storytelling

The homepage offers four contextual slides: people/community, facilities, insurer review and Orange Money coordination. Each slide has descriptive copy and a relevant CTA. Provide previous/next, direct slide selection and pause/play. Rotation stops during interaction and respects reduced motion and hidden tabs. Do not change focus on rotation. Announce manual changes without continuous screen-reader interruption.

Use real Liberian photography, prioritizing Monrovia where verified. Identify Harper and other locations honestly. Show author, source, reuse license and resizing/cropping disclosure. Keep a public provenance manifest and original hashes. No generated scenes may remain in served scene assets. Repeated contextual photographs are preferable to falsely labeling a vendor as an insurer or a documentary image as a LUX transaction. Copyright permission does not prove model-release or endorsement permission; consented commissioned photography is required for testimonials or product-specific promotional portraits.

### WEB-03 — Team profiles

Use only supplied names, roles, biographies and portraits. Cards open native modal dialogs using pointer or keyboard. Dialogs have an accessible name, initial close-button focus, trapped focus, Escape dismissal and focus return. Social/contact links use fine icon buttons with accessible labels. Publish only approved details; when none exist, state that directly and provide the organization's contact route. Accept safe HTTPS profiles and validated email/telephone values, never script/data protocols.

### WEB-04 — Enquiry and product claims

Store validated organizational enquiries with consent, anti-spam controls and honest submission feedback. Do not solicit medical records through public forms. Missing mail configuration must never result in “email sent” language. Partner listings require approved records and publication rights. Product screens and workflow illustrations are examples, not endorsements or live financial evidence.

## 6. Authentication, tenancy and staff access

### AUTH-01

Use Better Auth credential sessions, invitation acceptance, password reset and TOTP. Public signup, arbitrary email change and account deletion endpoints are blocked in the delivery adapters. Verify accounts through approved onboarding. Production operators require out-of-band identity verification and MFA enrollment. Demo accounts use unique generated passwords stored outside version control.

### AUTH-02

Every domain request resolves an authenticated actor, active membership, organization and permissions on the server. Organization selectors do not confer permissions. Recheck revoked/suspended membership on requests. Require fresh authentication for sensitive finance actions; apply production TOTP rules. Scope reads, counts, exports, files and mutations, not just menus.

### AUTH-03

Use exact trusted HTTPS origins and secure cookie behavior behind the deployed same-origin proxy. Keep database, HMAC, storage and worker secrets server-only. No `NEXT_PUBLIC_*` secrets. Invite/reset tokens expire and are single-use. Actual sender and recovery workflows require operational verification before production release.

## 7. Patient, coverage and encounter workflow

### CARE-01 — Patient directory

Support organization-scoped patient records and intake with duplicate indicators. Minimize displayed identifiers. Duplicate detection is an indicator, not an automatic merge. Correction/merge resolution needs approved policy and expanded operator UI before real patient onboarding.

### CARE-02 — Coverage

Record the insurer source, provenance, checked time and snapshot. Distinguish current, stale and unknown coverage. A synthetic/imported snapshot is not a live insurer guarantee. Import preview must validate shape before application. External coverage APIs and production catalogues remain integration requirements.

### CARE-03 — Encounters and prescriptions

Authorized clinicians create encounters and structured prescriptions. Claims reference the relevant encounter and itemized bill. Track authorship and organization. Broader clinical coding, prescription safety checks and medical decision support are not provided by the administrative pilot.

## 8. Claims and insurer review

### CLAIM-01 — Draft and submission

Select a patient/encounter, enter itemized services and exact minor-unit amounts, and attach evidence through the private pipeline. Recalculate totals server-side. Provide actor-scoped draft recovery/autosave and explicit submit feedback. Bind writes to expected versions to reject stale edits. Submission creates an immutable snapshot; later corrections must not rewrite original evidence/history.

### CLAIM-02 — Validation

A durable job checks completeness, coverage context, tariff bounds and duplicate indicators. Each finding identifies its rule, evidence and resolution history. Failures stay visible and retryable; no success state may be invented after a job crash. Current validation is deterministic; an actual model/OCR integration is not configured. The LUX AI label must not imply a deployed clinical AI or autonomous approval service.

### CLAIM-03 — Review and correction

Insurer reviewers inspect submitted data/findings, claim or assign review, record resolutions and request further information. Decisions include reason, actor, version and approved amount. Partial approval and rejection remain distinct. Appeals are separately recorded, preserving the original decision. Approved amount cannot exceed applicable claim limits. Insurer and facility histories remain organization-scoped.

**Claim state model:** `DRAFT → SUBMITTED → VALIDATING → AWAITING_REVIEW`; validation/review may lead to `NEEDS_INFORMATION`; permitted correction returns to a new draft/submission cycle. Review ends in `APPROVED`, `PARTIALLY_APPROVED` or `REJECTED`. Only permitted undispatched states may be withdrawn. The domain transition table is authoritative.

## 9. Orange Money payment coordination

### PAY-01 — Preparation and reservation

Authorize against insurer-approved claim balances under transactional row locks. Include prior active reservations so concurrent partial payments cannot exceed the payable amount. Snapshot base amount, currency, fee policy and verified facility destination. Require active contracts and permission. A configured environment name alone cannot enable a real business payout.

### PAY-02 — Maker/checker and confirmation

An independent finance actor checks the instruction. Sensitive actions require a fresh session and production security policy. Before demo dispatch, issue a generated four-digit authorization code displayed to that same user. State prominently: **“Never enter your real Orange Money PIN.”** This is a UI simulation of provider authorization, not an imitation provider credential form.

The demo challenge is bound to actor, organization, payment and payment version; expires in two minutes; permits at most five attempts; is HMAC-stored rather than plaintext; and is single-use. Challenge issuance is rate-limited. Failure counters must commit even when authorization is rejected. Codes may not appear in audit logs. A successful replay using the same command must return the original result without redispatch.

### PAY-03 — Durable dispatch and ambiguous outcomes

Persist payment intent, attempt and outbox atomically before external work. Workers claim durable jobs, record attempts, back off and expose dead work. Use idempotency keys and payload fingerprints. A timeout is not failure or settlement: retain `UNKNOWN_PENDING_INVESTIGATION`. Do not automatically reissue an ambiguous transfer. Accept only verified provider results; prevent out-of-order events from regressing settled facts. Reversals create compensating records.

**Payment states:** `CREATED`, `AWAITING_AUTHORIZATION`, `AUTHORIZED`, `AWAITING_FUNDS`, `PROCESSING`, `UNKNOWN_PENDING_INVESTIGATION`, `SETTLED`, `FAILED`, `CANCELLED`, `REVERSED`. The domain transition table defines permissible edges. Cancellation is limited to undispatched states. Settlement needs payment evidence, not merely a claim decision or client-side success screen.

### PAY-04 — Provider release gate

Demo adapter outcomes are synthetic. Live/sandbox business payments remain unavailable until Orange supplies and approves disbursement APIs, authentication, signatures, idempotency behavior, limits, supported currencies/exponents, status queries, reconciliation files, fee handling and reversal procedures. Real authorization must occur in Orange's approved channel; LUX never stores a real PIN. No provider affiliation may be implied by using the name “Orange Money.”

## 10. Fees and accounting

The pilot models a 2% total service fee, nominally 1% LUX and 1% Orange, subject to actual commercial approval. Use integer minor units, round the combined total half-up, split deterministically and assign the odd rounding residual to the Orange share. The nominal split therefore can differ by one minor unit.

For base `B` and fee `F`, insurer-added incidence records insurer debit `B+F` and facility net `B`. Facility-deducted incidence records insurer debit `B` and facility net `B−F`. `UNCONFIGURED` is not authorization-ready. Snapshot policy version and incidence in the instruction. Assess once at the correct lifecycle event. Earned/accrued fee records, provider collection and actual cash allocation are separate facts. Reversal creates compensating entries rather than deleting history. Synthetic policies are not evidence of a signed Orange fee agreement.

## 11. Reconciliation and reports

### REC-01

Stage provider records, checksum imports, validate duplicates and compare exact payment reference, amount, currency and status. Record row-level exceptions and evidence-backed resolutions. Unknown payments require investigation. Missing-provider and fee-allocation exception coverage, approved file mapping and operator procedures require expansion before live release.

### REPORT-01

Provide scoped claim totals, aging, review turnaround, payment latency, submission quality, exception aging and principal statements, with date/currency filters and audited CSV/PDF exports. Do not aggregate unlike currencies into an unlabeled monetary sum. “Approved” is not “paid,” and accrued fees are not cash received. Reports must be reproducible from authoritative records; operational targets are agreed during pilot discovery.

## 12. Evidence, CMS, notifications and operations

### FILE-01

Use private signed quarantine uploads, short-lived access, content/size verification, malware scanning and promotion of clean evidence. Store metadata and organization scope. Reject unconfigured storage/scanner explicitly. Never make medical evidence public or claim a scan occurred without a scanner. Hosted demo storage/scanning is a release blocker for real evidence use.

### CMS-01

Provide permission-controlled draft, preview and publication for structured page content; approved team/contact editing; partner publication flags; media source/license metadata. Version public changes and audit operators. Full rich multi-section editing and automated media management remain extensions; the checked-in photography build is reproducible now.

### NOTIFY-01

Use transactional, idempotent in-app notifications. Refresh authoritative state on relevant events/focus/polling. Send actual mail only with configured credentials and verified sender. Do not label a stored enquiry as delivered mail. SMS and granular preference controls are not part of the current implementation.

### OPS-01

Record immutable audit events, support requests, durable job attempts/dead states and integration readiness. Provide incident, unknown-payment, backup/restore and release runbooks. Monitor unknown payment age, dead jobs, exception age and failed scans—not just HTTP health. Assign named operational owners before real financial activity.

## 13. Architecture and data contracts

- **Frontend:** TypeScript Next.js App Router, server-rendered public content, client components for carousel, dialogs and authenticated interactions.
- **Domain/API:** modular Nest/TypeScript services with runtime validation, explicit permissions and state machines. A Fetch adapter reuses the same controller/domain implementation for Neon Functions.
- **Persistence:** PostgreSQL/Neon, checksummed ordered migrations, transactions, locks, optimistic versions, audit history and durable outbox/jobs. No Redis dependency is required for the pilot.
- **Authentication:** Better Auth sessions and TOTP. Neon PostgreSQL hosts persistence; this is not a second parallel auth system.
- **Worker:** durable batches through a separate Neon function and scheduled trigger, with strict trigger/manual bearer authorization. Never expose a public unauthenticated job runner.
- **Delivery:** Vercel Next.js frontend proxies API/auth to the backend over an exact server-configured URL. Secrets remain on backend/worker; build artifacts do not include `.env`.
- **Evidence:** private S3-compatible boundary and ClamAV protocol integration, pending hosted operational configuration.
- **External integrations:** Orange adapter contract, mail and optional insurer data sources; unavailable integrations fail honestly.

Major records: users/sessions/TOTP, organizations/memberships, contracts, patients, coverage snapshots/imports, encounters/prescriptions, claims/items/versions/findings/decisions/appeals, payments/attempts/challenges/events, fee policies/assessments/ledger entries, reconciliation batches/rows/exceptions, evidence metadata, notifications, CMS versions/team/partners, enquiries/invitations, support, audit and outbox/jobs.

API is versioned under `/api/v1`; authentication under `/api/auth`. Commands validate payload, tenant, permission, expected version and idempotency where required. Errors use stable codes, safe messages, correlation identifiers and field errors; never leak credentials or patient data through logs. See the repository's API documentation for route-level contracts.

## 14. Non-functional requirements

| Area            | Requirement / validation                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | TLS, exact origin validation, safe session cookies, server tenant checks, least privilege, no client secrets, rate limits and dependency review                                                            |
| Integrity       | Exact arithmetic, transactional reservations, immutable submissions/audit, idempotent commands, persistent dispatch and non-regressing results                                                             |
| Accessibility   | WCAG 2.2 AA target; keyboard navigation, focus visibility, labeled inputs/status, reduced motion, native modal semantics and meaningful photo alt text; manual assistive-technology signoff still required |
| Responsive UX   | No horizontal overflow at tested 360/768/1024/1440 widths; usable public routes and critical task screens                                                                                                  |
| Performance     | Responsive AVIF/WebP photographs, lazy non-critical media and eager first hero image; establish latency/Core Web Vitals budgets from deployed measurements rather than invented results                    |
| Availability    | Durable job recovery and explicit degradation; backups and restore exercises; paid infrastructure/SLA and recovery targets require operator agreement                                                      |
| Privacy         | Synthetic-only demo, minimum necessary data, private evidence, approved retention/processing basis and region review before real data                                                                      |
| Maintainability | Shared typed domain rules, checksummed migrations, automated unit/PostgreSQL/browser tests, reproducible bundles and source provenance                                                                     |

## 15. Environments and rollout

1. **Local:** isolated application/test databases, explicit demo mode, synthetic seed and optional local storage/scanner services.
2. **Hosted demo:** a newly created isolated Neon project; never migrate/reset legacy hosted data. Production Node runtime is allowed only with explicit `DEPLOYMENT_TIER=demo`, `LUX_MODE=demo`, HTTPS origins and synthetic organizations. Unique credentials remain private. No real patient details or funds.
3. **Controlled pilot:** approved organizations, authoritative datasets, verified staff and destinations, operational mail/storage/scanner and reconciliation procedures. Manual/unconfigured payment mode until integration certification.
4. **Live release:** provider contracts and commercial/legal/security approvals, complete critical operator controls, tested backups/monitoring and signed launch decision. Do not promote a seeded demo database as production.

Deployments must confirm health, same-origin authentication/cookies, permission denials, claim workflow, simulated maker/checker confirmation, durable worker execution and financial state integrity. Commit/push is an authorized delivery step, not evidence that hosted tests passed. Publish actual outcomes separately in `docs/test-results.md` and the release handoff.

## 16. Acceptance test scenarios

- Anonymous visitors reach every public route; no fabricated biography, partner or live transaction is displayed.
- Active carousel photos load, match licensed originals/manifest and retain public credits; reduced motion disables rotation.
- A keyboard user opens/closes a team profile and returns to the originating card; absent contact data creates no invented links.
- An enquiry is validated/stored; unconfigured mail produces no “sent” success claim.
- An invited user signs in and sees only active memberships; revoked/unrelated actors are denied.
- A facility creates an encounter/claim; server totals are exact; submitted snapshots remain unchanged by corrections.
- Validation produces explainable findings; authorized insurer reviewer records a reasoned decision.
- Concurrent partial payment reservations cannot exceed the approved remaining balance.
- Same-actor maker/checker, stale version, stale authentication, unconfigured fee policy and cross-tenant actions fail.
- Four-digit demo confirmation rejects missing/wrong/expired/exhausted challenges without dispatch; correct confirmation dispatches once; replay is idempotent.
- A timeout remains unknown, late verified status is reconciled, duplicate/out-of-order evidence cannot double-book or regress settlement.
- Fee assessment and reversal entries remain exact; accrued balances are not reported as collected cash.
- Private evidence requires scoped authorization and real scanning dependencies; malformed/oversize requests fail safely.
- Worker rejects unauthenticated manual calls; actual scheduled delivery processes durable jobs and is observable.
- CSV/PDF/report totals remain organization/currency scoped; logical backup restore succeeds in an isolated target.

## 17. Dependencies, risks and open decisions

| Dependency / risk                     | Required resolution                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Orange business API and authorization | Signed specifications, credentials, certification and approved PIN-free LUX boundary                           |
| Fee incidence and collection          | Commercial approval, currencies/exponents, collection mechanics and reconciled allocation                      |
| Real organization onboarding          | Identity, contract, coverage/tariff authority, destinations and staff MFA                                      |
| Healthcare data governance            | Legal review, processing basis, hosting region, retention/deletion and incident obligations                    |
| Photography rights                    | Maintain copyright attribution; commission model-released photos for endorsements/specific workflow depiction  |
| Storage and mail                      | Private bucket/scanner, sender verification and realistic failure/recovery tests                               |
| Operations                            | Named owners, monitoring, budget, capacity, recovery objectives and incident exercises                         |
| Product completeness                  | Expand patient/import, clinical field UX, rich CMS, remaining reconciliation/operator controls and API schemas |
| Accessibility                         | Manual screen-reader/keyboard signoff beyond automated tests                                                   |

## 18. Delivery artifacts and definition of done

Deliver source, migrations, reproducible synthetic seed, environment-name template, deployment/runbooks, API documentation, photo provenance, automated tests, factual test/release report, this PRD and a private credential handoff. A demonstration is done only when locally verified and, if deployed, smoke-tested at the real URL. **Live-production readiness is a separate milestone and remains blocked by the dependencies above.** The detailed capability matrix is `docs/capabilities.md`; it takes precedence over any shorthand marketing description of availability.
