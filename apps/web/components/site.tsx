import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import {
  aiCapabilities,
  aiPrinciples,
  claimChecks,
  claimJourney,
  familyBenefits,
  faqs,
  illustrationSrc,
  illustrationSrcSet,
  luxProvides,
  orangeProvides,
  partnerValues,
  patientSteps,
  portals,
  roadmap,
  roadmapMetrics,
  securityPractices,
  siteImages,
  trustRoles,
  type SiteImageKey,
} from "../lib/site";
import { publicData, team as fallback } from "../lib/content";
import { TeamGallery } from "./team-gallery";

function ImageSource({
  name,
  sizes,
  priority = false,
  decorative = false,
}: {
  name: SiteImageKey;
  sizes: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  const image = siteImages[name];
  const mid = image.widths[Math.min(1, image.widths.length - 1)];
  return (
    <picture>
      <source
        type="image/avif"
        srcSet={illustrationSrcSet(name, "avif")}
        sizes={sizes}
      />
      <source
        type="image/webp"
        srcSet={illustrationSrcSet(name, "webp")}
        sizes={sizes}
      />
      <img
        src={illustrationSrc(name, mid)}
        srcSet={illustrationSrcSet(name, "jpg")}
        sizes={sizes}
        alt={decorative ? "" : image.alt}
        width={image.width}
        height={image.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}

export function Illustration({
  name,
  sizes = "(max-width: 900px) 100vw, 50vw",
  priority = false,
  className = "",
}: {
  name: SiteImageKey;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={`lux-figure ${className}`.trim()}>
      <ImageSource name={name} sizes={sizes} priority={priority} />
    </figure>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  id,
  light = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  id?: string;
  light?: boolean;
}) {
  return (
    <header className={"lux-heading" + (light ? " is-light" : "")}>
      <span className="lux-eyebrow">{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      {sub && <p className="lux-sub">{sub}</p>}
    </header>
  );
}

export function HomeHero() {
  return (
    <section className="lux-hero" aria-labelledby="hero-title">
      <div className="lux-hero-media" aria-hidden="true">
        <ImageSource
          name="hero-doctor-patient"
          sizes="100vw"
          priority
          decorative
        />
      </div>
      <div className="lux-hero-shade" aria-hidden="true" />
      <div className="lux-wrap lux-hero-inner">
        <span className="lux-tag">LUX HEALTHPAY AI</span>
        <h1 id="hero-title">
          Verify the care. Verify the coverage. <em>Pay the provider.</em>
        </h1>
        <p>
          A Liberia-first platform that connects insurers, healthcare providers
          and Orange Money in one digital claims workflow.
        </p>
        <div className="lux-cta">
          <Link className="lux-btn" href="/get-started?type=PATIENT">
            Register with LUX <ArrowUpRight size={18} />
          </Link>
          <Link className="lux-btn lux-btn-ghost" href="#how">
            See how it works <ArrowRight size={18} />
          </Link>
        </div>
        <ul className="lux-hero-points">
          <li>
            <Check size={16} /> Insurer-controlled decisions
          </li>
          <li>
            <Check size={16} /> Provider payment tracking
          </li>
          <li>
            <Check size={16} /> One auditable claim record
          </li>
        </ul>
      </div>
    </section>
  );
}

export function PageHero({
  label,
  title,
  text,
  image,
  children,
}: {
  label: string;
  title: string;
  text: string;
  image: SiteImageKey;
  children?: React.ReactNode;
}) {
  const picture = siteImages[image];
  return (
    <section className="lux-page-hero" aria-labelledby="page-title">
      <div
        className="lux-page-hero-media"
        style={{ "--lux-focus": picture.position } as React.CSSProperties}
        aria-hidden="true"
      >
        <ImageSource name={image} sizes="100vw" priority decorative />
      </div>
      <div className="lux-page-hero-shade" aria-hidden="true" />
      <div className="lux-wrap lux-page-hero-inner">
        <span className="lux-tag">{label}</span>
        <h1 id="page-title">{title}</h1>
        <p>{text}</p>
        {children}
      </div>
    </section>
  );
}

export function PatientJourney({ surface = false }: { surface?: boolean }) {
  return (
    <section
      id="how"
      className={"lux-section" + (surface ? " lux-soft" : "")}
      aria-labelledby="how-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="For patients"
          title="Covered in seven steps"
          sub="Health insurance should not need endless paperwork or a bank account."
          id="how-title"
        />
        <ol className="lux-steps">
          {patientSteps.map(([title, text], index) => (
            <li className="lux-card" key={title}>
              <span className="lux-step-num">{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <div className="lux-section-foot">
          <Link className="lux-text-link" href="/get-started?type=PATIENT">
            Start your registration <ArrowRight size={17} />
          </Link>
          <Link className="lux-text-link" href="/login">
            Organization login <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FamilySection() {
  return (
    <section
      id="benefits"
      className="lux-section lux-soft"
      aria-labelledby="family-title"
    >
      <div className="lux-wrap lux-split">
        <Illustration name="family-phone" />
        <div>
          <SectionHeading
            eyebrow="Family cover"
            title="Protect your family"
            sub="Private health insurance should not need endless paperwork or a bank account."
            id="family-title"
          />
          <div className="lux-checks two">
            {familyBenefits.map(([title, text]) => (
              <div className="lux-pill" key={title}>
                {title}
                <small>{text}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClaimChecks({ surface = false }: { surface?: boolean }) {
  return (
    <section
      id="claims"
      className={"lux-section" + (surface ? " lux-soft" : "")}
      aria-labelledby="checks-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Validation"
          title="Every claim validated"
          sub="Six automatic checks, and a human reviewer for unusual claims."
          id="checks-title"
        />
        <div className="lux-checks">
          {claimChecks.map(([title, text]) => (
            <div className="lux-pill" key={title}>
              {title}
              <small>{text}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClaimJourney({ surface = false }: { surface?: boolean }) {
  return (
    <section
      id="platform"
      className={"lux-section" + (surface ? " lux-soft" : "")}
      aria-labelledby="journey-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="The platform"
          title="One claim journey, from visit to payment"
          sub="LUX turns slow, manual, paper-heavy insurance claims into fast, verified, paid-and-recorded healthcare transactions."
          id="journey-title"
        />
        <ol className="lux-steps">
          {claimJourney.map(([title, text], index) => (
            <li className="lux-card" key={title}>
              <span className="lux-step-num">{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Portals() {
  return (
    <section
      id="portals"
      className="lux-section lux-soft"
      aria-labelledby="portals-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Roles and views"
          title="Three portals, one ledger"
          sub="Everyone in the claim journey gets the view they need, and every transaction can be audited."
          id="portals-title"
        />
        <div className="lux-steps">
          {portals.map(([title, text], index) => (
            <article className="lux-card" key={title}>
              <span className="lux-step-num">{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AiBand() {
  return (
    <section
      id="ai"
      className="lux-section lux-band"
      aria-labelledby="ai-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Bounded assistance"
          title="AI that assists. People decide."
          sub="The AI verification engine supports the process. It does not replace doctors, insurers or human decision-makers."
          id="ai-title"
          light
        />
        <div className="lux-checks">
          {aiCapabilities.map(([title, text]) => (
            <div className="lux-pill on-dark" key={title}>
              {title}
              <small>{text}</small>
            </div>
          ))}
        </div>
        <div className="lux-steps three">
          {aiPrinciples.map(([title, text]) => (
            <article className="lux-card on-dark" key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OrangeSection() {
  return (
    <section id="orange" className="lux-section" aria-labelledby="orange-title">
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Payments"
          title="Powered by Orange Money"
          sub="Orange Money provides the payment and wallet infrastructure. LUX coordinates the claim, the insurer authorizes payment, and the provider sees one traceable record."
          id="orange-title"
        />
        <ol className="lux-flow">
          {[
            [
              "01",
              "The insurer approves",
              "Coverage and payment authorization stay with the insurer.",
            ],
            [
              "02",
              "Orange Money pays",
              "Approved funds move through Orange Money payment infrastructure.",
            ],
            [
              "03",
              "LUX records the result",
              "Provider and insurer see the same reconciled transaction.",
            ],
          ].map(([step, title, text]) => (
            <li key={step}>
              <span>{step}</span>
              <b>{title}</b>
              <small>{text}</small>
            </li>
          ))}
        </ol>
        <div className="lux-split start lux-payment-split">
          <div className="lux-card plain">
            <h3>Orange provides</h3>
            <ul className="lux-list">
              {orangeProvides.map((item) => (
                <li key={item}>
                  <Check size={17} /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="lux-card plain">
            <h3>LUX provides</h3>
            <ul className="lux-list">
              {luxProvides.map((item) => (
                <li key={item}>
                  <Check size={17} /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustSection() {
  return (
    <section
      id="trust"
      className="lux-section lux-soft"
      aria-labelledby="trust-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Controlled responsibilities"
          title="Built on security and trust"
          sub="No single component should be able to approve and pay itself."
          id="trust-title"
        />
        <div className="lux-checks">
          {trustRoles.map(([title, text]) => (
            <div className="lux-pill" key={title}>
              {title}
              <small>{text}</small>
            </div>
          ))}
        </div>
        <div className="lux-checks second">
          {securityPractices.map(([title, text]) => (
            <div className="lux-pill" key={title}>
              {title}
              <small>{text}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PartnerSection() {
  return (
    <section
      id="partners"
      className="lux-section lux-band"
      aria-labelledby="partners-title"
    >
      <div className="lux-wrap lux-split">
        <div>
          <SectionHeading
            eyebrow="For organizations"
            title="For insurers and health facilities"
            sub="LUX is the registration, enrollment and validation layer between the person, Orange Money, the insurer and the facility."
            id="partners-title"
            light
          />
          <div className="lux-steps two">
            {partnerValues.map(([title, text, detail]) => (
              <article className="lux-card on-dark" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
                <p className="lux-small">{detail}</p>
              </article>
            ))}
          </div>
          <div className="lux-cta">
            <Link className="lux-btn" href="/partners">
              Partner with LUX <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
        <Illustration name="team-at-work" />
      </div>
    </section>
  );
}

export function RoadmapSection() {
  return (
    <section
      id="roadmap"
      className="lux-section"
      aria-labelledby="roadmap-title"
    >
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="A bounded pilot"
          title="Start small. Prove it. Expand."
          sub="One insurer and two to three healthcare providers first, with human review of every AI-flagged claim."
          id="roadmap-title"
        />
        <div className="lux-steps">
          {roadmap.map(([title, text], index) => (
            <article className="lux-card" key={title}>
              <span className="lux-step-num">{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <h3 className="lux-subhead">What we will measure</h3>
        <div className="lux-checks">
          {roadmapMetrics.map(([title, text]) => (
            <div className="lux-pill" key={title}>
              {title}
              <small>{text}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PromiseBand() {
  return (
    <section
      className="lux-section lux-band lux-promise"
      aria-label="The LUX promise"
    >
      <div className="lux-wrap narrow center">
        <span className="lux-eyebrow">The LUX promise</span>
        <h2>
          A patient should not have to wonder: am I covered? A provider should
          not have to wonder: will I be paid? An insurer should not have to
          review every claim by hand when technology can safely assist.
        </h2>
        <p>Verify the Care. Verify the Coverage. Pay the Provider.</p>
      </div>
    </section>
  );
}

export function JoinBand({
  title = "Ready to get covered?",
  text = "Ask a LUX agent, or visit an Orange shop or agent, to register. You can also send a registration enquiry through this website.",
  href = "/get-started?type=PATIENT",
  label = "Register with LUX",
}: {
  title?: string;
  text?: string;
  href?: string;
  label?: string;
}) {
  return (
    <section
      id="join"
      className="lux-section lux-soft"
      aria-labelledby="join-title"
    >
      <div className="lux-wrap narrow center">
        <h2 id="join-title">{title}</h2>
        <p className="lux-sub">{text}</p>
        <Link className="lux-btn" href={href}>
          {label} <ArrowUpRight size={18} />
        </Link>
        <p className="lux-join-alt">
          Prefer to talk first?{" "}
          <Link href="/contact">Speak with the LUX team</Link>
        </p>
      </div>
    </section>
  );
}

export function TeamSection({ preview = false }: { preview?: boolean }) {
  return (
    <section className="lux-section" aria-labelledby="team-title">
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="The people behind LUX"
          title="Real people. Clear responsibilities."
          sub="Meet the team bringing research, product, community and technology perspectives to LUX HealthPay."
          id="team-title"
        />
        <TeamCards preview={preview} />
      </div>
    </section>
  );
}

export async function TeamCards({ preview = false }: { preview?: boolean }) {
  const stored = await publicData("team");
  const members = Array.isArray(stored)
    ? stored
    : fallback.map((member) => ({
        ...member,
        photo: "/media/" + member.photo,
        alt: `Portrait of ${member.name}`,
      }));
  return <TeamGallery members={members.slice(0, preview ? 3 : 5)} />;
}

export function FAQSection() {
  return (
    <section className="lux-section" aria-labelledby="faq-title">
      <div className="lux-wrap lux-faq-layout">
        <SectionHeading
          eyebrow="Good questions"
          title="Clarity before cover."
          sub="What to know before you register or invite your organization."
          id="faq-title"
        />
        <div className="lux-faq">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DemoPreview() {
  return (
    <section className="lux-section lux-soft" aria-labelledby="demo-title">
      <div className="lux-wrap">
        <SectionHeading
          eyebrow="Inside the workspace"
          title="A claim, without the guesswork."
          sub="Encounter details, validation findings, insurer review and payment status in one shared view."
          id="demo-title"
        />
        <div
          className="lux-demo"
          role="img"
          aria-label="LUX HealthPay facility workspace showing a claim awaiting insurer review"
        >
          <div className="lux-demo-top">
            <span className="lux-demo-mark">L</span>
            <b>LUX HealthPay</b>
            <span className="lux-demo-badge">CLAIMS WORKSPACE</span>
          </div>
          <div className="lux-demo-body">
            <div className="lux-demo-side">
              <span>WORKSPACE</span>
              <b>Overview</b>
              <span>Claims</span>
              <span>Payments</span>
              <span>Reconciliation</span>
            </div>
            <div className="lux-demo-main">
              <span className="lux-eyebrow">Facility workspace</span>
              <h3>One record, from visit to payment.</h3>
              <div className="lux-demo-record">
                <div>
                  <small>CLAIM RECORD</small>
                  <strong>LHP-0003</strong>
                </div>
                <span className="lux-demo-status">Awaiting insurer review</span>
              </div>
              <ul className="lux-list">
                <li>
                  <Check size={16} /> Encounter and bill submitted
                </li>
                <li>
                  <Check size={16} /> Validation findings available
                </li>
                <li>Insurer decision recorded in the claim</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="lux-cta">
          <Link className="lux-btn" href="/login">
            Open the workspace <ArrowUpRight size={18} />
          </Link>
          <Link className="lux-text-link" href="/get-started?type=FACILITY">
            Request organization access <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
