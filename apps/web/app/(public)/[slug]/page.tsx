import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  Intro,
  CTA,
  Process,
  ProcessDiagram,
  TeamCards,
  FAQ,
} from "../../../components/public";
import { services, publicData } from "../../../lib/content";
import { EnquiryForm } from "../../../components/enquiry-form";
import { PartnerRecords } from "../../../components/partner-records";
import { SceneImage } from "../../../components/scene-image";
import type { SceneKey } from "../../../lib/scenes";
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
  return {
    title: slug
      .split("-")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" "),
  };
}
export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!known.includes(slug)) notFound();
  if (slug === "how-it-worut") redirect("/how-it-works");
  const cms = await publicData("pages/" + slug);
  if (cms?.content)
    return (
      <>
        <Intro
          label="LUX HealthPay"
          title={cms.content.title}
          text={cms.content.intro}
        />
        <div className="container prose section">
          {cms.content.sections.map((s: any, i: number) => (
            <section key={i}>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
        </div>
        <CTA />
      </>
    );
  if (slug === "services")
    return (
      <>
        <Intro
          label="Our services"
          title="From first record to final reconciliation."
          text="A focused set of services for the work between healthcare delivery, insurer review and confirmed payment."
        />
        <div className="container service-list">
          {services.map(([tag, title, text, output, next], i) => (
            <section className="service-row" key={title}>
              <div>
                <span className="step-number">0{i + 1}</span>
                <span className="eyebrow">{tag}</span>
                <h2>{title}</h2>
                {[0, 1, 3, 4, 5].includes(i) && (
                  <SceneImage
                    scene={
                      (
                        [
                          "coverage-check",
                          "facility-claims",
                          "facility-claims",
                          "insurer-review",
                          "orange-money-coordination",
                          "partner-collaboration",
                        ] as SceneKey[]
                      )[i]
                    }
                    className="service-scene"
                  />
                )}
              </div>
              <div>
                <p className="large-copy">{text}</p>
                <h3>The output</h3>
                <p>{output}</p>
                <h3>What happens next</h3>
                <p>{next}</p>
                <Link
                  href={"/get-started?type=" + (i < 2 ? "FACILITY" : "INSURER")}
                  className="text-link"
                >
                  Discuss this service <ArrowUpRight size={18} />
                </Link>
              </div>
            </section>
          ))}
        </div>
        <CTA />
      </>
    );
  if (slug === "how-it-works")
    return (
      <>
        <Intro
          label="How it works"
          title="A claim is a journey. Keep the whole story."
          text="The facility prepares. LUX connects and checks records. The insurer decides and authorizes. Payment evidence confirms what happened."
        />
        <section className="container">
          <ProcessDiagram />
        </section>
        <section className="section container process-layout">
          <div>
            <span className="eyebrow">The complete workflow</span>
            <h2>
              Seven steps.
              <br />
              Clear responsibilities.
            </h2>
            <p>
              A validation flag asks for review. It is not a fraud verdict, and
              it does not transfer decision authority to AI.
            </p>
          </div>
          <Process full />
        </section>
        <section className="section soft">
          <div className="container">
            <h2>Not every claim follows a straight line.</h2>
            <div className="three-grid">
              <article>
                <span className="badge">Normal claim</span>
                <h3>Complete, then reviewed.</h3>
                <p>
                  A complete submission passes validation and joins the insurer
                  queue. A human reviewer still records the decision before
                  finance can authorize payment.
                </p>
              </article>
              <article>
                <span className="badge">Returned claim</span>
                <h3>A reason. A new version.</h3>
                <p>
                  A reviewer requests missing evidence. The facility corrects
                  and resubmits; earlier versions and the reason remain
                  traceable.
                </p>
              </article>
              <article>
                <span className="badge">Awaiting funds</span>
                <h3>Approved is not paid.</h3>
                <p>
                  The insurer has approved a claim but payment funding is not
                  ready. The receivable remains outstanding until independently
                  confirmed settlement.
                </p>
              </article>
            </div>
          </div>
        </section>
        <CTA />
      </>
    );
  if (slug === "about")
    return (
      <>
        <Intro
          label="About LUX HealthPay"
          title="Better records. Better connected organizations."
          text="Our mission is practical: make healthcare claims easier to prepare, review and trace, starting with the needs of facilities and insurers in Liberia."
        />
        <section className="section container split-heading">
          <h2>
            A focused answer
            <br />
            to fragmented work.
          </h2>
          <div>
            <p className="large-copy">
              Healthcare administration should support care—not lose its story
              between organizations.
            </p>
            <p>
              When treatment records, coverage references and bills move through
              separate channels, small gaps can lead to repeated follow-up. LUX
              HealthPay creates a shared, permission-controlled workflow while
              preserving each organization’s responsibilities.
            </p>
            <p>
              Our intended value is a useful service connecting insurers and
              their contracted facilities, with Orange Money as the intended
              payment channel. We provide software and records, not a custodial
              wallet.
            </p>
          </div>
        </section>
        <section className="section soft">
          <div className="container">
            <span className="eyebrow">Our practical principles</span>
            <div className="two-grid">
              {[
                [
                  "Accurate records",
                  "Keep versioned submissions, exact amounts and evidence for important changes.",
                ],
                [
                  "Insurer authority",
                  "Coverage decisions and payment authorization remain with authorized insurer staff.",
                ],
                [
                  "Responsible assistance",
                  "AI supports completeness and consistency checks. It does not reject claims or prescribe treatment.",
                ],
                [
                  "Traceable payments",
                  "Distinguish authorization, processing and confirmed settlement. Resolve uncertainty rather than hide it.",
                ],
              ].map(([t, p]) => (
                <article key={t}>
                  <h2>{t}</h2>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="section container prose">
          <h2>A pilot, built for learning.</h2>
          <p>
            We invite suitable facilities and insurers to discuss a bounded
            pilot: agreed workflows, synthetic demonstrations, clear permissions
            and explicit integration readiness. Live financial behavior requires
            approved commercial terms and supported provider capabilities.
          </p>
          <p>
            No partnerships, licenses or performance claims are implied by this
            website.
          </p>
        </section>
        <CTA />
      </>
    );
  if (slug === "partners")
    return (
      <>
        <Intro
          label="Partner opportunities"
          title="Different responsibilities. One connected workflow."
          text="We are inviting insurers and health facilities to discuss a focused LUX HealthPay pilot. Proposed relationships are not presented as confirmed partnerships."
        />
        <section className="section container">
          <div className="three-grid">
            {[
              [
                "Insurance companies",
                "Bring authoritative coverage, agreed tariffs and human review. Retain control over approvals and payment authorizations.",
              ],
              [
                "Health facilities",
                "Bring care documentation, structured bills and the operational team responsible for accurate submissions.",
              ],
              [
                "Orange Money",
                "The intended payment channel, subject to approved contracts and confirmed business-payment capabilities. No endorsement is implied.",
              ],
            ].map(([t, p]) => (
              <article key={t}>
                <h2>{t}</h2>
                <p>{p}</p>
                <Link className="text-link" href="/get-started">
                  Discuss an opportunity <ArrowRight size={18} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="section soft">
          <div className="container split-heading">
            <div>
              <span className="eyebrow">Integration status</span>
              <h2>
                Clear about
                <br />
                what is ready.
              </h2>
            </div>
            <div>
              <p className="large-copy">
                Demonstration available.
                <br />
                Live payment integration not enabled.
              </p>
              <p>
                Business disbursement, status queries, event verification and
                fee collection must be confirmed against a contracted provider’s
                actual capabilities. A web checkout product is not proof of
                payout support.
              </p>
              <p>
                If an assisted manual-reference pilot is agreed, independent
                reconciliation evidence is required before a payment can be
                marked settled. A reference typed into LUX is not, by itself,
                proof of payment.
              </p>
              <PartnerRecords />
            </div>
          </div>
        </section>
        <CTA />
      </>
    );
  if (slug === "team")
    return (
      <>
        <Intro
          label="Our team"
          title="People behind a clearer process."
          text="Meet the five members bringing research, product, community and technology perspectives to LUX HealthPay."
        />
        <section className="section container">
          <TeamCards />
        </section>
        <CTA />
      </>
    );
  if (slug === "get-started" || slug === "contact")
    return (
      <>
        <Intro
          label={slug === "contact" ? "Contact" : "Get started"}
          title="Let’s build a clearer connection."
          text="Tell us about your organization and the workflow you would like to improve. This is an enquiry—not an instant-access registration."
        />
        <section className="section container enquiry-layout">
          <aside>
            <h2>A focused first conversation.</h2>
            <p>
              We’ll review your enquiry before discussing pilot suitability and
              organization onboarding.
            </p>
            <ol className="simple-list">
              <li>Tell us who you are.</li>
              <li>Share your organization’s needs.</li>
              <li>Agree the right next step.</li>
            </ol>
            <div className="notice">
              Please do not include patient details, medical records, passwords
              or Orange Money PINs.
            </div>
          </aside>
          <EnquiryForm />
        </section>
      </>
    );
  const legal: Record<
    string,
    { title: string; intro: string; sections: string[][] }
  > = {
    privacy: {
      title: "Privacy, with clear boundaries.",
      intro:
        "Operator-review draft. This notice must be approved and completed before production use with real patient data.",
      sections: [
        [
          "What LUX records",
          "Public enquiries collect organization and contact details so an authorized operator can review a request. Do not send patient information through public forms. Authenticated workflows hold the minimum records needed for an approved organization relationship.",
        ],
        [
          "Who can access records",
          "Access depends on active memberships, role permissions and the facility–insurer relationship. Finance views omit unnecessary clinical detail. External messages must not contain clinical information.",
        ],
        [
          "Purpose, retention and rights",
          "The operator must approve the processing basis, retention periods, authorized disclosures and a verified privacy contact before live onboarding. Contact LUX through the enquiry form for privacy questions; do not include sensitive records.",
        ],
        [
          "Storage and safeguards",
          "Private files are quarantined and scanned before authorized access. Signed links expire. Audit and financial evidence is retained under an approved policy. No certification or blanket regulatory compliance is claimed.",
        ],
      ],
    },
    terms: {
      title: "Terms for a responsible pilot.",
      intro:
        "Operator-review draft. These terms are not a substitute for approved organization contracts or legal advice.",
      sections: [
        [
          "The service",
          "LUX HealthPay provides software and records for structured claims, insurer review and payment tracking. It does not hold insurer or facility funds, provide a patient wallet or guarantee claim approval.",
        ],
        [
          "Organization responsibilities",
          "Facilities are responsible for accurate submissions. Insurers control coverage, decisions and payment authorizations. Users must keep credentials secure and access only records they are permitted to use.",
        ],
        [
          "Payments and fees",
          "Live financial use requires approved commercial terms, a configured fee-incidence policy and supported provider capabilities. Review time and settlement time are distinct. Payment references and browser redirects do not establish settlement.",
        ],
        [
          "Demonstration and limitations",
          "Synthetic demonstrations do not move real funds. No successful live integration, partnership, settlement deadline or performance metric is implied. The operator must approve final terms and contact details before production.",
        ],
      ],
    },
    accessibility: {
      title: "Access should be part of the design.",
      intro:
        "We aim to meet WCAG 2.2 AA where applicable. This is a design and testing goal, not an unverified certification.",
      sections: [
        [
          "Using this website",
          "Public pages include a skip link, semantic headings, keyboard navigation, labeled forms and visible focus indicators. Mobile navigation supports Escape and focus containment. Motion respects reduced-motion preferences.",
        ],
        [
          "Report an accessibility issue",
          "Use the contact form to describe the page, task, device and assistive technology involved. Do not include medical records. An operator can review the stored enquiry.",
        ],
        [
          "Known limitations",
          "Full manual screen-reader evaluation and production content review remain release gates. Authorized service photography and final Orange artwork have not been supplied. Automated checks alone cannot establish complete accessibility conformance.",
        ],
      ],
    },
  };
  const content = legal[slug];
  return (
    <>
      <Intro label="LUX HealthPay" title={content.title} text={content.intro} />
      <div className="section container prose">
        {content.sections.map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
      </div>
    </>
  );
}
