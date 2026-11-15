import { team } from "../../../packages/config/team";

export { team };

export const siteNav = [
  ["For patients", "/#how"],
  ["Platform", "/services"],
  ["AI", "/#ai"],
  ["Orange", "/partners#orange"],
  ["Partners", "/partners"],
  ["Team", "/team"],
] as const;

export const patientSteps = [
  [
    "Register",
    "With your ID and mobile number, through a LUX agent, an Orange shop or agent, or self-service.",
  ],
  [
    "Orange Money",
    "No account? One is opened at registration and linked to your LUX account.",
  ],
  [
    "Choose a plan",
    "Compare cover, waiting periods and partner facilities on your dashboard.",
  ],
  [
    "Pay the premium",
    "Orange Money pays the insurance company directly. LUX never holds your money.",
  ],
  ["Receive care", "Show your LUX ID and policy number at a partner facility."],
  ["We validate", "LUX checks the claim against your policy and agreed rules."],
  [
    "Insurer pays",
    "The insurer pays the facility. You see the claim status on your dashboard.",
  ],
] as const;

export const familyBenefits = [
  ["One account", "Linked to your own Orange Money number"],
  ["Direct to insurer", "LUX does not hold customer money"],
  ["See your cover", "Plans, waiting periods, facilities"],
  ["Track claims", "Status on your dashboard"],
] as const;

export const claimChecks = [
  ["1. Identity", "Matched to your account and policy"],
  ["2. Policy active", "Premium paid"],
  ["3. Cover", "Waiting period passed, service covered"],
  ["4. Network", "Facility is in the insurer’s network"],
  ["5. Fair price", "Within the agreed tariff"],
  ["6. Duplicates", "No repeated claims"],
] as const;

export const claimJourney = [
  ["Identify", "The provider registers and identifies the patient."],
  [
    "Verify",
    "LUX checks insurance eligibility and retrieves the applicable benefits.",
  ],
  ["Submit", "The provider submits the claim with supporting documents."],
  [
    "Review",
    "AI-assisted tools flag missing information, duplicates and inconsistencies.",
  ],
  ["Decide", "The insurer approves, partially approves or declines."],
  ["Pay", "An authorized payment instruction is sent through Orange Money."],
  [
    "Confirm",
    "The provider receives payment confirmation and a digital record.",
  ],
  [
    "Reconcile",
    "LUX reconciles the transaction for the insurer and the provider.",
  ],
] as const;

export const portals = [
  [
    "Provider dashboard",
    "Register patients and verify insurance, generate bills, submit claims, upload documents, track payment confirmation and view transaction history.",
  ],
  [
    "Insurer portal",
    "Verify policyholders, configure benefit rules and approval limits, review AI-flagged claims, monitor payments, reconcile and generate reports.",
  ],
  [
    "Patient access",
    "View coverage where permitted, track claims and payment status, and receive receipts and your healthcare transaction history.",
  ],
  [
    "Ledger",
    "A controlled record of claims, approvals, payments, fees and reconciliation, so every transaction can be audited.",
  ],
] as const;

export const aiCapabilities = [
  [
    "Claim information extraction",
    "Diagnoses, treatments, procedures, dates, medicines and billed amounts",
  ],
  ["Rule matching", "Compared with the insurer’s configured benefit rules"],
  ["Duplicate detection", "Potentially repeated claims"],
  [
    "Inconsistency detection",
    "Differences between clinical documentation and billing",
  ],
  ["Missing-information check", "Incomplete claims caught before final review"],
  ["Risk-based routing", "Unusual claims go to human reviewers"],
] as const;

export const aiPrinciples = [
  ["The insurer decides", "AI does not make the final insurance decision."],
  [
    "A flag is not proof",
    "An AI flag is a reason for further review, not proof of fraud.",
  ],
  [
    "AI cannot move money",
    "Claim approval and payment authorization are separate controlled processes.",
  ],
] as const;

export const orangeProvides = [
  "Payment and wallet infrastructure",
  "Merchant wallets for providers",
  "Settlement of approved payments",
  "Regulated financial infrastructure",
] as const;

export const luxProvides = [
  "Healthcare identity and provider network",
  "Claims workflow and AI-assisted verification",
  "Healthcare rules and insurer configuration",
  "Ledger, reconciliation and reporting",
] as const;

export const trustRoles = [
  ["Healthcare information", "Provider"],
  ["Insurance decision", "Insurer"],
  ["Verification assistance", "LUX AI"],
  ["Payment execution", "Orange Money"],
  ["Records and coordination", "LUX"],
] as const;

export const securityPractices = [
  ["Encryption", "In transit and at rest"],
  ["Access control", "Role-based access and multi-factor authentication"],
  ["Audit logs", "Secure APIs and transaction monitoring"],
  ["Data minimization", "Separate financial and clinical permissions"],
] as const;

export const partnerValues = [
  [
    "Insurers",
    "New customers and cleaner, faster claims.",
    "Coverage rules, human decisions and payment authorization remain with the insurer.",
  ],
  [
    "Facilities",
    "Reliable payment for validated claims.",
    "Clear submission requirements, traceable corrections and payment confirmation.",
  ],
] as const;

export const roadmap = [
  [
    "Validate: now",
    "Interview insurers and providers, present LUX to Orange, obtain legal advice and validate the payment architecture.",
  ],
  [
    "Build: months 1 to 3",
    "Provider dashboard, insurer portal, patient access, claims workflow, AI prototype, payment sandbox and ledger.",
  ],
  [
    "Pilot: months 3 to 6",
    "Controlled pilot with one insurer and two to three providers, with limited transactions.",
  ],
  [
    "Expand: months 6 to 9",
    "More insurers and providers, including pharmacies and laboratories.",
  ],
] as const;

export const roadmapMetrics = [
  ["Claims", "Processing time and completeness on first submission"],
  ["AI", "Flag accuracy and false-positive rate"],
  ["Payments", "Success rate and time from approval to payment"],
  ["Providers", "Fewer payment delays and disputes"],
  ["Insurers", "Less manual work and lower processing cost"],
] as const;

export const faqs = [
  [
    "Does LUX approve insurance claims?",
    "No. LUX structures records and supports validation. The insurer controls coverage decisions and payment authorization, and every claim can be reviewed by a person.",
  ],
  [
    "How does payment work?",
    "Orange Money provides the payment and wallet infrastructure. The insurer authorizes payment for an approved claim, and LUX records the transaction and its reconciliation status.",
  ],
  [
    "How do I register?",
    "Start with the registration form on this site, or visit a LUX agent or an Orange shop or agent. A LUX agent will guide you through the cover options available.",
  ],
  [
    "Can patients store money in LUX?",
    "No. LUX is a software and records platform. It does not hold customer money, operate a patient wallet, or take custody of insurer or facility funds.",
  ],
  [
    "Who can join the pilot?",
    "Health facilities and insurers working on structured claims and payment visibility can send an organization enquiry. Our team reviews each request before onboarding.",
  ],
] as const;

export const siteImages = {
  "hero-doctor-patient": {
    widths: [480, 960, 1170],
    width: 1170,
    height: 900,
    position: "60% 32%",
    alt: "A clinician and a patient reviewing care information on a tablet.",
  },
  "family-phone": {
    widths: [480, 960, 1200],
    width: 1200,
    height: 900,
    position: "52% 36%",
    alt: "A family reviewing health cover together on a phone at home.",
  },
  "team-at-work": {
    widths: [480, 960, 1600],
    width: 1600,
    height: 900,
    position: "52% 34%",
    alt: "A team collaborating around a laptop in a bright office.",
  },
} as const;

export type SiteImageKey = keyof typeof siteImages;

export function illustrationSrcSet(
  key: SiteImageKey,
  format: "avif" | "webp" | "jpg",
) {
  return siteImages[key].widths
    .map((width) => `/media/illustrations/${key}-${width}.${format} ${width}w`)
    .join(", ");
}

export function illustrationSrc(key: SiteImageKey, width?: number) {
  const image = siteImages[key];
  return `/media/illustrations/${key}-${width ?? image.widths.at(-1)}.jpg`;
}

export const pageTitles: Record<string, string> = {
  services: "Platform",
  "how-it-works": "How it works",
  about: "About LUX HealthPay",
  partners: "Partners",
  team: "Team",
  "get-started": "Register with LUX",
  contact: "Contact LUX HealthPay",
  privacy: "Privacy",
  terms: "Terms",
  accessibility: "Accessibility",
};
