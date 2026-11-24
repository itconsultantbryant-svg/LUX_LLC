import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  AiBand,
  ClaimChecks,
  ClaimJourney,
  DemoPreview,
  FAQSection,
  Illustration,
  JoinBand,
  OrangeSection,
  PageHero,
  PartnerSection,
  PatientJourney,
  Portals,
  PromiseBand,
  RoadmapSection,
  SectionHeading,
  TeamSection,
  TrustSection,
} from "../../../components/site";
import { EnquiryForm } from "../../../components/enquiry-form";
import { pageTitles, type SiteImageKey } from "../../../lib/site";

const known = [
  "services",
  "how-it-works",
  "about",
  "partners",
  "team",
  "get-started",
  "contact",
  "privacy",
  "terms",
  "accessibility",
  "how-it-worut",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: pageTitles[slug] || "LUX HealthPay" };
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!known.includes(slug)) notFound();
  if (slug === "how-it-worut") redirect("/how-it-works");

  if (slug === "services")
    return (
      <>
        <PageHero
          label="Platform"
          title="One connected platform. Three accountable views."
          text="LUX connects providers, insurers and patients around a single claim journey. Each organization sees the part of the record it is authorized to use, and every transaction can be audited."
          image="team-at-work"
        >
          <div className="lux-cta">
            <Link className="lux-btn" href="/get-started?type=FACILITY">
              Request a walkthrough <ArrowUpRight size={18} />
            </Link>
            <Link className="lux-btn lux-btn-ghost" href="/login">
              Open the workspace <ArrowRight size={18} />
            </Link>
          </div>
        </PageHero>
        <ClaimJourney />
        <Portals />
        <DemoPreview />
        <ClaimChecks />
        <TrustSection />
        <AiBand />
        <JoinBand
          title="See how the platform fits your organization."
          text="Request a focused walkthrough of the LUX workspace before discussing pilot suitability."
          href="/get-started?type=FACILITY"
          label="Request a walkthrough"
        />
      </>
    );

  if (slug === "how-it-works")
    return (
      <>
        <PageHero
          label="For patients"
          title="Covered in seven steps. Tracked to payment."
          text="From registration and premium payment to care and a validated claim, LUX keeps the status visible without taking coverage decisions away from the insurer."
          image="hero-doctor-patient"
        >
          <div className="lux-cta">
            <Link className="lux-btn" href="/get-started?type=PATIENT">
              Register with LUX <ArrowUpRight size={18} />
            </Link>
            <Link className="lux-btn lux-btn-ghost" href="#how">
              Explore the journey <ArrowRight size={18} />
            </Link>
          </div>
        </PageHero>
        <PatientJourney />
        <ClaimJourney surface />
        <ClaimChecks />
        <OrangeSection />
        <FAQSection />
        <JoinBand />
      </>
    );

  if (slug === "about")
    return (
      <>
        <PageHero
          label="About LUX HealthPay"
          title="A Liberia-first platform for a clearer claims journey."
          text="Our mission is practical: connect people, providers, insurers and Orange Money around verified claims and traceable payment records."
          image="team-at-work"
        />
        <section className="lux-section">
          <div className="lux-wrap lux-split">
            <Illustration name="hero-doctor-patient" />
            <div>
              <SectionHeading
                eyebrow="Why LUX"
                title="Less fragmentation between care and payment."
                sub="Paper-heavy claims and disconnected records make it hard for patients to know what is covered and for providers to know when they will be paid."
              />
              <p className="lux-lead">
                LUX is the registration, enrollment and validation layer between
                the person, Orange Money, the insurer and the facility. Insurers
                keep every coverage decision; LUX does not hold customer money.
              </p>
            </div>
          </div>
          <div className="lux-wrap">
            <div className="lux-stats">
              <div>
                <strong>3</strong>
                <span>accountable views</span>
              </div>
              <div>
                <strong>7</strong>
                <span>patient journey steps</span>
              </div>
              <div>
                <strong>6</strong>
                <span>automatic claim checks</span>
              </div>
              <div>
                <strong>1</strong>
                <span>reconciled claim record</span>
              </div>
            </div>
          </div>
        </section>
        <AiBand />
        <RoadmapSection />
        <TeamSection />
        <PromiseBand />
        <JoinBand
          title="Build the pilot with us."
          text="We are inviting one insurer and two to three healthcare providers to discuss a bounded, human-reviewed pilot."
          href="/partners"
          label="Explore partnership"
        />
      </>
    );

  if (slug === "partners")
    return (
      <>
        <PageHero
          label="Partners"
          title="Different responsibilities. One connected workflow."
          text="Insurers, health facilities and Orange Money each bring a defined role to the same claim journey. LUX connects those responsibilities without taking any of them over."
          image="team-at-work"
        >
          <div className="lux-cta">
            <Link className="lux-btn" href="/get-started?type=FACILITY">
              Discuss a pilot <ArrowUpRight size={18} />
            </Link>
            <Link className="lux-btn lux-btn-ghost" href="/contact">
              Contact the team <ArrowRight size={18} />
            </Link>
          </div>
        </PageHero>
        <OrangeSection />
        <TrustSection />
        <PartnerSection />
        <section className="lux-section">
          <div className="lux-wrap">
            <SectionHeading
              eyebrow="Integration"
              title="Built around real responsibilities."
              sub="A pilot begins with named roles, agreed evidence and a payment flow that every party can reconcile."
            />
            <div className="lux-split start">
              <div className="lux-card plain">
                <h3>Payment and reconciliation</h3>
                <ul className="lux-list">
                  <li>
                    <ArrowRight size={16} /> Insurer-approved payment
                    instructions
                  </li>
                  <li>
                    <ArrowRight size={16} /> Orange Money disbursement and
                    status checks
                  </li>
                  <li>
                    <ArrowRight size={16} /> Shared reconciliation evidence for
                    every transaction
                  </li>
                  <li>
                    <ArrowRight size={16} /> Clear fee incidence and settlement
                    records
                  </li>
                </ul>
              </div>
              <div className="lux-card plain">
                <h3>What we agree before a pilot</h3>
                <ul className="lux-list">
                  <li>
                    <ArrowRight size={16} /> Named insurer and facility
                    responsibilities
                  </li>
                  <li>
                    <ArrowRight size={16} /> Evidence and reconciliation rules
                  </li>
                  <li>
                    <ArrowRight size={16} /> Human review for every AI-flagged
                    claim
                  </li>
                  <li>
                    <ArrowRight size={16} /> Approved commercial and data terms
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
        <RoadmapSection />
        <JoinBand
          title="Start a focused conversation."
          text="Tell us about your organization, your current claims workflow and the outcome you want to improve."
          href="/get-started"
          label="Discuss a pilot"
        />
      </>
    );

  if (slug === "team")
    return (
      <>
        <PageHero
          label="Our team"
          title="Meet the people behind LUX HealthPay."
          text="Five members bringing research, product, community and technology perspectives to a Liberia-first claims platform."
          image="team-at-work-2"
        >
          <div className="lux-cta">
            <Link className="lux-btn" href="/contact">
              Contact the team <ArrowUpRight size={18} />
            </Link>
            <Link className="lux-btn lux-btn-ghost" href="/about">
              About LUX <ArrowRight size={18} />
            </Link>
          </div>
        </PageHero>
        <TeamSection />
        <PromiseBand />
        <JoinBand
          title="Work with LUX."
          text="Health facilities, insurers and implementation partners can start with an enquiry."
          href="/contact"
          label="Contact the team"
        />
      </>
    );

  if (slug === "get-started" || slug === "contact")
    return (
      <>
        <PageHero
          label={slug === "contact" ? "Contact" : "Register with LUX"}
          title={
            slug === "contact"
              ? "Let’s build a clearer connection."
              : "Register your interest with LUX."
          }
          text={
            slug === "contact"
              ? "Tell us about your organization and the workflow you would like to improve. We will help you find the right next step."
              : "Ask about patient or family cover, or request organization access for a facility or insurer. A LUX agent will guide you from there."
          }
          image={slug === "contact" ? "family-phone" : "hero-doctor-patient"}
        />
        <section className="lux-section lux-registration">
          <div className="lux-wrap lux-enquiry">
            <aside className="lux-aside-card">
              <span className="lux-eyebrow">What happens next</span>
              <h2>A focused first conversation.</h2>
              <p>
                Tell us a little about yourself or your organization. We will
                use that to route your request to the right person.
              </p>
              <ol className="lux-side-steps">
                <li>
                  <span>01</span>
                  <div>
                    <b>Tell us who you are.</b>
                    <small>Patient, family, facility or insurer.</small>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <b>Share what you need.</b>
                    <small>Cover, onboarding or a pilot conversation.</small>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <b>Agree the next step.</b>
                    <small>
                      A LUX agent follows up with the right options.
                    </small>
                  </div>
                </li>
              </ol>
            </aside>
            <EnquiryForm />
          </div>
        </section>
        <FAQSection />
        <JoinBand
          title="Prefer to speak with someone?"
          text="Ask a LUX agent, or visit an Orange shop or agent, to register. You can also send an organization enquiry."
          href="/contact"
          label="Contact LUX"
        />
      </>
    );

  const legal: Record<
    string,
    { title: string; intro: string; image: SiteImageKey; sections: string[][] }
  > = {
    privacy: {
      title: "Privacy, with clear boundaries.",
      intro:
        "How LUX HealthPay handles the information you share with us, and the boundaries that protect it.",
      image: "family-phone",
      sections: [
        [
          "Information we collect",
          "When you send an enquiry, we collect the contact and organization details you provide so we can respond and route your request. We also collect the basic technical information needed to operate and secure the website.",
        ],
        [
          "How we use it",
          "We use enquiry details to respond to you, guide registration or onboarding, and improve the service. We do not sell personal information or use public enquiry details for unrelated marketing.",
        ],
        [
          "Who can access records",
          "Access depends on active memberships, role permissions and the facility–insurer relationship. Finance views omit unnecessary clinical detail, and external messages do not contain clinical information.",
        ],
        [
          "Retention and your rights",
          "We keep enquiry and account records only for as long as needed to respond, operate the service, meet audit obligations and resolve disputes. You can ask us about the information we hold about you through the contact form.",
        ],
        [
          "Storage and safeguards",
          "Private files are quarantined and scanned before authorized access. Signed links expire, access is role-based, and sensitive actions are logged for audit.",
        ],
      ],
    },
    terms: {
      title: "Terms for a responsible pilot.",
      intro:
        "The terms that govern use of the LUX HealthPay website, public enquiries and organization workspaces.",
      image: "team-at-work",
      sections: [
        [
          "The service",
          "LUX HealthPay provides software and records for structured claims, insurer review and payment tracking. It does not hold insurer or facility funds, operate a patient wallet or guarantee claim approval.",
        ],
        [
          "Using the website",
          "You may use the public website to learn about LUX and to send an enquiry. You must provide accurate information and may not use the site to interfere with its operation or access records you are not authorized to see.",
        ],
        [
          "Registration enquiries",
          "A public registration or contact enquiry starts a conversation with our team. Availability, underwriting and eligibility remain subject to insurer approval and the cover options confirmed during registration.",
        ],
        [
          "Organization responsibilities",
          "Facilities are responsible for accurate submissions. Insurers control coverage, decisions and payment authorizations. Users must keep credentials secure and access only the records their role permits.",
        ],
        [
          "Payments and fees",
          "Payment for an approved claim follows the commercial terms agreed for the pilot. Review time and settlement time are separate, and every payment is recorded against the claim for reconciliation.",
        ],
        [
          "Availability and changes",
          "We may update the service, these terms or the website as the product develops. Material changes will be reflected on this page, and continued use means you accept the updated terms.",
        ],
      ],
    },
    accessibility: {
      title: "Access should be part of the design.",
      intro:
        "LUX HealthPay is built with keyboard, screen-reader and mobile access in mind, and we continue to test against WCAG 2.2 AA.",
      image: "hero-doctor-patient",
      sections: [
        [
          "Using this website",
          "Public pages include a skip link, semantic headings, keyboard navigation, labeled forms and visible focus indicators. Mobile navigation supports Escape and focus containment, and motion respects reduced-motion preferences.",
        ],
        [
          "Images and media",
          "Images carry descriptive alternative text, and decorative imagery is hidden from assistive technology. Interactive components expose their state and are operable without a mouse.",
        ],
        [
          "Forms and feedback",
          "Forms use visible labels, clear hints and announced error messages. Required fields are identified, and success or failure is reported to assistive technology.",
        ],
        [
          "Report an accessibility issue",
          "Use the contact form to describe the page, task, device and assistive technology involved. Our team will review the enquiry and follow up with you.",
        ],
        [
          "Continuous improvement",
          "Accessibility is part of our design and release process. Automated checks, keyboard testing and manual review inform each update to the site.",
        ],
      ],
    },
  };

  const content = legal[slug];
  return (
    <>
      <PageHero
        label="Trust and legal"
        title={content.title}
        text={content.intro}
        image={content.image}
      />
      <div className="lux-prose">
        {content.sections.map(([heading, copy]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{copy}</p>
          </section>
        ))}
        <div className="lux-prose-contact">
          <div>
            <h2>Questions?</h2>
            <p>
              Send them through the LUX contact form and our team will reply.
            </p>
          </div>
          <Link className="lux-btn small" href="/contact">
            Contact LUX <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </>
  );
}
