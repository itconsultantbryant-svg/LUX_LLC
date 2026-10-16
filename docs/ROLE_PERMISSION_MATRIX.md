# HealthWallet Liberia — Role and Permission Matrix

Permissions are enforced server-side. UI hides unavailable actions but is not the security boundary.

Legend: **C** = create/initiate, **R** = read, **U** = update, **A** = approve/authorize, **X** = execute/settle, **—** = none.

---

## 1. Roles

| Role code          | Display name                         | Typical actor                                 |
| ------------------ | ------------------------------------ | --------------------------------------------- |
| `customer`         | Customer / caregiver                 | Uninsured or underserved patient or caregiver |
| `contributor`      | Family / diaspora contributor        | Person funding another’s healthcare pot       |
| `provider_staff`   | Healthcare provider staff            | Clinic/hospital billing or front-desk staff   |
| `provider_admin`   | Healthcare provider admin            | Provider organization administrator           |
| `employer_admin`   | Employer / organization admin        | HR or benefits administrator                  |
| `sponsor_admin`    | NGO / charity / program sponsor      | Program funder administrator                  |
| `reviewer`         | Authorized reviewer                  | Human in the loop for uncertain cases         |
| `platform_admin`   | Platform administrator               | LUX AI operations                             |
| `partner_readonly` | Financial / insurance partner (read) | Authorized reporting consumer                 |
| `system`           | System / job runner                  | Background workers and adapters               |

Configurable default: a user may hold multiple roles; least privilege applies per action.

---

## 2. Resource permissions

### 2.1 Identity and profiles

| Resource / action | customer | contributor | provider_staff | provider_admin | employer_admin | sponsor_admin | reviewer | platform_admin | partner_readonly |
| ----------------- | -------- | ----------- | -------------- | -------------- | -------------- | ------------- | -------- | -------------- | ---------------- |
| Own profile R/U   | R/U      | R/U         | R/U            | R/U            | R/U            | R/U           | R/U      | R/U            | R                |
| Other user PII    | —        | limited*    | limited*       | limited*       | limited*       | limited*      | R        | R/U            | —                |
| Assign roles      | —        | —           | —              | —              | —              | —             | —        | A              | —                |
| Consent records   | C/R      | C/R         | C/R            | C/R            | C/R            | C/R           | R        | R              | —                |

\*Limited to fields required for contribution targeting, bill confirmation, or program enrollment; no bulk export.

### 2.2 Wallets, ledgers, and contributions

| Resource / action            | customer | contributor   | provider_* | employer_admin | sponsor_admin    | reviewer | platform_admin | partner_readonly |
| ---------------------------- | -------- | ------------- | ---------- | -------------- | ---------------- | -------- | -------------- | ---------------- |
| Own wallet balance / history | R        | R (own pots)  | —          | R (org pots)   | R (program pots) | R        | R              | —                |
| Deposit / top-up (adapter)   | C        | C             | —          | C              | C                | —        | C              | —                |
| Create contribution pot      | C        | C             | —          | C              | C                | —        | C              | —                |
| Contribute to pot            | C        | C             | —          | C              | C                | —        | C              | —                |
| Set / view restrictions      | R/U own  | R/U own gifts | —          | R/U org        | R/U program      | R        | R/U            | —                |
| Reserve funds for bill       | C        | —             | —          | —              | —                | A*       | A              | —                |
| Fee schedule                 | R        | R             | R          | R              | R                | R        | R/U            | R                |

\*Reviewer may release or adjust reservations only under recorded exception policy.

### 2.3 Bills, documents, and AI validation

| Resource / action             | customer | contributor | provider_staff  | provider_admin | reviewer | platform_admin |
| ----------------------------- | -------- | ----------- | --------------- | -------------- | -------- | -------------- |
| Submit bill / upload document | C        | —           | C (for patient) | C              | —        | C              |
| View own / assigned bill      | R        | —           | R (org)         | R (org)        | R        | R              |
| Confirm / correct extraction  | U        | —           | U (org)         | U (org)        | U        | U              |
| Trigger re-extraction         | C        | —           | C               | C              | C        | C              |
| View AI evidence / confidence | R        | —           | R (org)         | R (org)        | R        | R              |
| Override validation outcome   | —        | —           | —               | —              | A        | A              |
| Delete document (soft)        | U*       | —           | —               | U              | —        | U              |

\*Only before payment authorization; audit retains hash/metadata per retention policy (configurable).

### 2.4 Funding determination and payments

| Resource / action         | customer  | provider_*      | reviewer      | platform_admin  | partner_readonly |
| ------------------------- | --------- | --------------- | ------------- | --------------- | ---------------- |
| View funding proposal     | R         | —               | R             | R               | —                |
| Confirm payment intent    | A         | —               | A (escalated) | A               | —                |
| Execute settlement        | system    | —               | —             | X (break-glass) | —                |
| View payment / receipt    | R         | R (own payouts) | R             | R               | R (authorized)   |
| Refund / reverse (policy) | C request | C request       | A             | A/X             | —                |
| Reconciliation reports    | —         | R (own)         | R             | R               | R (authorized)   |

Payment execution is deterministic and adapter-mediated. UI never “marks paid” without adapter acknowledgment or explicit sandbox simulation label.

### 2.5 Providers and programs

| Resource / action          | provider_staff | provider_admin | sponsor_admin | reviewer | platform_admin | customer                    |
| -------------------------- | -------------- | -------------- | ------------- | -------- | -------------- | --------------------------- |
| Provider profile           | R              | R/U            | R             | R        | R/U/A          | R (public directory fields) |
| Verification status change | —              | C request      | —             | A        | A              | —                           |
| Program definition         | —              | —              | C/R/U         | R        | C/R/U/A        | R (eligible programs)       |
| Enrollment                 | —              | —              | C/R           | A        | A              | C/R own                     |

**Rule:** Provider “verified” status must come from an authorized verification process. Demo data must be labeled as simulated.

### 2.6 Notifications, reporting, and audit

| Resource / action            | customer | contributor | provider_*     | reviewer     | platform_admin | partner_readonly   |
| ---------------------------- | -------- | ----------- | -------------- | ------------ | -------------- | ------------------ |
| Own notifications            | R/U      | R/U         | R/U            | R/U          | R/U            | R                  |
| Case audit trail             | R own    | —           | R org payments | R            | R              | limited            |
| AI involvement metrics       | —        | —           | —              | R            | R              | —                  |
| Platform operational reports | —        | —           | —              | R            | R              | authorized exports |
| Export PII                   | own      | own         | org limited    | case limited | controlled     | contract-bound     |

---

## 3. Environment and break-glass controls

| Control                            | Who                                   | Notes                                                 |
| ---------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Switch app to live payment adapter | `platform_admin` + environment config | Requires confirmed credentials; audit logged          |
| Impersonate user (support)         | `platform_admin` only                 | Time-boxed, audited, demo-discouraged                 |
| Bypass human review                | Never by default                      | Configurable only with explicit policy flag and audit |

---

## 4. Unresolved permission questions

- Who is the legal custodian of customer funds, and which role may move custody?
- Which Orange Liberia operator roles, if any, require read access in demo vs production?
- What is the minimum KYC tier for contribution and payout thresholds?

Defaults are configurable and reversible; they do not grant legal authority.
