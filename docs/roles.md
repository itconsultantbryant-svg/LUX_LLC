# Role matrix

The executable source of truth is `packages/domain/index.ts`. Multiple memberships and multiple roles per membership are supported. Roles may be combined, but maker/checker identity must still differ.

| Role               | Allowed scope                                                                          | Explicit exclusions                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PLATFORM_ADMIN     | onboarding, CMS, operational metadata, own LUX audit, support                          | no general clinical access, insurer decisions or payouts                                                            |
| SUPPORT            | support and operational metadata                                                       | no clinical evidence or payments                                                                                    |
| LUX_FINANCE        | LUX fee accruals and reconciliation                                                    | no general clinical detail                                                                                          |
| FACILITY_ADMIN     | users, settings, contracts, destination requests                                       | no insurer decisions                                                                                                |
| FACILITY_CLINICIAN | authorized clinical read and explicit `encounters.write` permission                    | no insurer decisions or payment authorization                                                                       |
| FACILITY_CLAIMS    | eligibility, preparation, corrections, facility claims and clinical evidence read      | cannot author clinician records without a separately assigned clinician role; no insurer decision/payment authority |
| FACILITY_FINANCE   | payment summaries, reconciliation, reports                                             | no clinical detail                                                                                                  |
| INSURER_ADMIN      | users, contracts, coverage/tariff settings                                             | no decision/payment role unless separately assigned                                                                 |
| INSURER_REVIEWER   | insurer claims, evidence, decisions and appeal review                                  | no payment authorization                                                                                            |
| INSURER_FINANCE    | minimum-detail payment records, maker/checker authorization, execution, reconciliation | no clinical content                                                                                                 |
| INSURER_AUDITOR    | authorized clinical and payment evidence, read-only audit/reports                      | no mutations through reviewer/payment commands                                                                      |
| ORANGE_OBSERVER    | optional fee scope                                                                     | disabled for invitation grants until agreed                                                                         |
| PATIENT            | own cover, own insurer-published limits and own non-draft claim history                | no organization membership, other patient, facility/insurer workspace, payment, audit or admin access               |

Patient access is not a membership. It is a `patient_accounts` link from a verified user to one facility patient record and one insurer patient reference. The API synthesizes a `PATIENT` context, allows only `/overview`, `/nav` and the patient's own `/patient/*` reads, and never grants organization permissions. An invitation creates that link only after the patient verifies the matching email and sets a password. Insurers provision invitations from their own patient references; they cannot attach a patient to another insurer's record.

Every list/detail/search/export/download command repeats authorization. Direct URLs do not inherit sidebar permission. Membership revocation is queried on each request. Non-demo privileged roles require enrolled MFA; high-risk commands additionally require a session created within ten minutes.

Support-access grant schema exists, but no grant-based clinical bypass is implemented. This is intentionally fail-closed. A production support-investigation workflow must be separately reviewed before it can grant sensitive access.
