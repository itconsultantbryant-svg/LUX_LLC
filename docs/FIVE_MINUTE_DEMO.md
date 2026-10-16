# Five-minute demo

A tight, honest walkthrough of HealthWallet Liberia × LUX HealthTrust for a
non-technical audience. Everything shown is **synthetic** and the deployment is
**clearly labelled** as a simulation. Measured results are quoted with their
denominators; nothing is rounded up to a nicer story.

Deeper walkthrough and reviewer-console setup: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md).
The measured numbers behind step 10: [EVALUATION.md](./EVALUATION.md) and
`docs/evaluation/`.

## Before you start (2 minutes, once)

```bash
pnpm demo:local:keep        # set up a labelled synthetic demo and leave it running
# Web: http://127.0.0.1:5173   API health: http://127.0.0.1:4000/health
```

The synthetic fixtures (all prefixed `SYNTHETIC`, none real):

- Customer `+999700000001`; family contributor `+999700000002`; reviewer `+999700000003`.
- Provider "SYNTHETIC Care Clinic" (verified); sponsor "SYNTHETIC Community Sponsor".
- One LRD 4,000 bill with a document, an AI run, a review case, a payment intent,
  a dispute, and wallet balances split across funding sources.

Sign-in uses simulated phone codes; no SMS is sent. Keep the browser on the demo
origin so the simulation labels stay visible.

## The script (10 steps ≈ 5 minutes)

1. **Show the label (20s).** Open the demo origin. Point out that the app states
   it is a demo and that AI is LUX HealthTrust. This honesty is part of the
   product, not a disclaimer buried in a footer.
2. **Prove the environment (20s).** Open `/health`. Read it aloud:
   `appEnv: demo`, `simulation: true`, and every adapter (`ai`, `payments`,
   `messaging`) `mode: sandbox`. No real money or messages are involved.
3. **Sign in (30s).** Sign in as the synthetic customer with a sandbox phone
   code. Show that the session is the customer's own — there is no shared
   account.
4. **The wallet (30s).** Open the customer home. Show one balance composed of
   distinct sources — personal savings, family contributions, sponsor vouchers
   (restricted), partner credit (pending). The ledger records where each unit of
   money came from and what it may pay for.
5. **A bill, read by AI (40s).** Open the synthetic bill. Run/show extraction:
   the platform reads the document and proposes fields with confidence and
   evidence. Stress: **this is a proposal, not a decision.**
6. **A person decides (40s).** Show the validation result and the review case.
   Because the synthetic case is uncertain, the platform routes it to a human.
   The AI does not auto-approve something that needs review.
7. **Provider confirms (30s).** Show the provider side: the clinic confirms the
   accurate bill. Providers attest to the service; they never hold customer
   funds.
8. **Pay and get a receipt (40s).** Reserve funds for the bill, then authorize
   the payment as the customer. The payment reaches `succeeded` and a receipt is
   issued. Show `GET /api/payments/:id/status`.
9. **Ops control (30s).** Run reconciliation (`POST /api/admin/reconcile` or
   `pnpm reconcile`) and show `GET /api/admin/metrics` with a healthy
   `job_queue`. Reconciliation adjusts platform state only and never fabricates
   partner settlement.
10. **The measured results (40s).** Open `docs/evaluation/latest.md` and
    `journey.md`. Read the headline numbers with their denominators:

    | What                                                | Measured          |
    | --------------------------------------------------- | ----------------- |
    | Payment reliability (reached succeeded + receipt)   | **1.000 (1/1)**   |
    | Receipts issued for succeeded payments              | **1.000 (1/1)**   |
    | Repeated-callback recovery (replay changes nothing) | **1.000 (1/1)**   |
    | End-to-end user tasks completed                     | **1.000 (8/8)**   |
    | Extraction accuracy — all labeled critical fields   | **1.000 (39/39)** |
    | Uncertain cases routed to a person                  | **1.000 (3/3)**   |
    | Missed suspicious cases (false negatives)           | **0.000 (0/15)**  |
    | Necessary review suppressed                         | **no**            |

    Then say the honest part: these are the deterministic pipeline's results on a
    small, purpose-built dataset. They **prove the controls work and that review
    is never suppressed**; they do **not** prove accuracy against real Orange
    Money data or a real population. That is what a pilot is for.

## What the demo must NOT claim

- Do not claim any real money moved, or that partner settlement occurred. Every
  settlement in demo is "expected".
- Do not quote an "85–90% AI" figure. That is an unresolved question for Orange
  (see [ASSUMPTIONS_AND_INTEGRATIONS.md](./ASSUMPTIONS_AND_INTEGRATIONS.md)).
- Do not present the evaluation numbers as field accuracy; state the dataset size.
- Do not imply fund custody that is not agreed.

## After the demo

```bash
# Reset to a clean synthetic state at any time
pnpm demo:local
```

For a hosted demo, replace the origin in step 1 with the deployed demo URL and
verify it first with:

```bash
node deploy/verify-demo.mjs https://YOUR-DEMO-ORIGIN
```
