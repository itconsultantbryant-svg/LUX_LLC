import { team } from "../../../packages/config/team";
export { team };
export const nav = [
  ["Home", "/"],
  ["Services", "/services"],
  ["How It Works", "/how-it-works"],
  ["About", "/about"],
  ["Partners", "/partners"],
  ["Team", "/team"],
];
export const services = [
  [
    "Coverage, with context.",
    "Patient coverage verification",
    "Facility claims officers check insurer-sourced policy records before preparing a claim. Each result records its source and when it was checked.",
    "An eligibility snapshot with benefits and limitations, where supplied. Unknown or stale coverage is clearly marked—not treated as approval.",
    "Prepare the encounter record.",
  ],
  [
    "A stronger submission.",
    "Treatment records & itemized bills",
    "Clinicians document the encounter; claims officers assemble the bill, prescriptions and supporting evidence in a guided submission.",
    "One versioned submission with server-checked totals, required fields and a traceable reference.",
    "Submit for validation.",
  ],
  [
    "Support, not a verdict.",
    "AI-assisted validation",
    "Deterministic checks review completeness, tariff consistency and possible duplicates. AI assistance is bounded to authorized evidence.",
    "Specific findings tied to a field or item. A flag asks for human review; it is not a fraud verdict.",
    "Insurer review and resolution.",
  ],
  [
    "Decisions stay with insurers.",
    "Insurer exception review",
    "Authorized insurer reviewers inspect the submission and evidence, request a correction or record a reasoned decision.",
    "A recorded approval, partial approval, rejection or request for information. Every pilot claim requires a human decision.",
    "Authorize the approved payable amount.",
  ],
  [
    "Know what happens next.",
    "Payment authorization & tracking",
    "Insurer finance staff authorize approved amounts under maker/checker controls. Orange Money is the intended payment channel.",
    "Separate authorized, processing, awaiting-funds and confirmed states. A timeout remains uncertain, never silently successful.",
    "Confirm against payment evidence.",
  ],
  [
    "Close the loop.",
    "Reconciliation, audit & reporting",
    "Finance teams compare claim approvals, payment instructions and verified transaction records. Exceptions retain ownership and evidence.",
    "Currency-separated statements, unsettled amounts, fee allocations and an auditable claim-to-payment history.",
    "Resolve exceptions and retain a clear record.",
  ],
];
export const steps = [
  [
    "Organization onboarding",
    "An insurer or facility requests access. LUX reviews the request and invitations establish approved memberships.",
  ],
  [
    "Patient eligibility",
    "The facility checks authorized insurer coverage. Stale, unavailable and unknown responses remain explicit.",
  ],
  [
    "Encounter & bill",
    "The facility records treatment and prescriptions, prepares itemized charges and submits required evidence.",
  ],
  [
    "Validation & insurer decision",
    "LUX surfaces completeness and consistency findings. The insurer reviews every pilot claim and records its decision.",
  ],
  [
    "Payment authorization",
    "Insurer finance checks the payable remainder, verified destination and disclosed fee policy. A separate checker authorizes execution.",
  ],
  [
    "Orange Money processing",
    "Payment uses a contracted supported channel, or an explicitly agreed manual-reference pilot. Provider outages do not become success.",
  ],
  [
    "Confirmation & reconciliation",
    "Verified evidence confirms settlement. Finance teams reconcile records and investigate unmatched or ambiguous transactions.",
  ],
];
export const faqs = [
  [
    "Does LUX approve insurance claims?",
    "No. LUX structures records and supports validation. The insurer controls coverage decisions and payment authorization. Every pilot claim needs human insurer review.",
  ],
  [
    "Is Orange Money live today?",
    "Orange Money is the intended payment channel. Live business-payment capabilities require approved contracts, verified destinations and provider configuration. The demonstration uses synthetic transactions only.",
  ],
  [
    "What happens when information is missing?",
    "An insurer reviewer can return a claim with a reason. The facility corrects the draft and submits a new version; the original submission remains in the history.",
  ],
  [
    "How long does settlement take?",
    "Review time and payment settlement time are separate. Neither instant approval nor a guaranteed settlement time is promised. Status changes depend on authorized decisions and verified payment evidence.",
  ],
  [
    "Can patients store money in LUX?",
    "No. LUX is a software and records platform, not a patient wallet or a custodian of insurer or facility funds.",
  ],
  [
    "Who can join the pilot?",
    "Health facilities and insurers interested in structured claims and payment visibility can send an organization enquiry. A public request never creates an active organization.",
  ],
];
export async function publicData(path: string) {
  try {
    const res = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/v1/public/${path}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (res.ok) return await res.json();
  } catch {}
  return null;
}
