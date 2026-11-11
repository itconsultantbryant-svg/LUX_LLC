import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  FileCheck2,
  SearchCheck,
  Waypoints,
  Check,
} from "lucide-react";
import {
  CTA,
  Process,
  TeamCards,
  FAQ,
  ProductPreview,
  ProcessDiagram,
} from "../../components/public";
import { publicData } from "../../lib/content";
import { HeroCarousel } from "../../components/hero-carousel";
import { SceneImage } from "../../components/scene-image";
import { OrangeMoneyStory } from "../../components/orange-money-story";
export default async function Home() {
  const published = await publicData("pages/home");
  return (
    <>
      <HeroCarousel
        title={published?.content?.title}
        intro={published?.content?.intro}
      />
      <div className="principles-strip">
        <div className="container">
          <span>
            <Check size={17} /> One claim history
          </span>
          <span>
            <Check size={17} /> Insurer decision authority
          </span>
          <span>
            <Check size={17} /> Evidence-led payment tracking
          </span>
        </div>
      </div>
      <section className="section container split-heading">
        <div>
          <span className="eyebrow">The work between care and payment</span>
          <h2>
            Less fragmentation.
            <br />
            More clarity.
          </h2>
        </div>
        <div>
          <p className="large-copy">
            Care happens in one place. The records often don’t.
          </p>
          <p>
            Coverage checks, treatment notes, prescriptions and bills can sit
            across separate records. Missing details and repeated follow-up make
            it harder to understand what is ready for review—and what is still
            outstanding.
          </p>
          <p>
            LUX HealthPay brings that workflow together, without taking
            decisions away from the people responsible for them.
          </p>
        </div>
      </section>
      <section className="section soft">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A practical service</span>
              <h2>
                Built around the claim.
                <br />
                Designed for the people.
              </h2>
            </div>
            <Link href="/services" className="text-link">
              Explore our services <ArrowRight size={18} />
            </Link>
          </div>
          <div className="pillars">
            {[
              [
                FileCheck2,
                "01",
                "Prepare with confidence",
                "Structured treatment records, itemized bills and evidence that stays with the claim.",
              ],
              [
                SearchCheck,
                "02",
                "Review with context",
                "Clear findings help insurer teams focus on exceptions and make reasoned decisions.",
              ],
              [
                Waypoints,
                "03",
                "Track with evidence",
                "Follow authorized payments through confirmation and reconciliation—not assumptions.",
              ],
            ].map(([Icon, n, title, text]: any) => (
              <article key={n}>
                <Icon size={32} strokeWidth={1.5} />
                <span className="pillar-index">{n}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link href="/services">
                  Learn more <ArrowUpRight size={17} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="benefit-grid">
          <article>
            <SceneImage scene="facility-claims" className="benefit-scene" />
            <span className="eyebrow">For health facilities</span>
            <h2>
              Give every submission
              <br />a stronger start.
            </h2>
            <p>
              Check insurer coverage, organize encounter documentation and see
              exactly what needs attention. Keep corrections and receivables
              connected to their claim.
            </p>
            <ul className="checklist">
              <li>
                <Check size={17} /> Guided, itemized claim preparation
              </li>
              <li>
                <Check size={17} /> Clear reasons when information is returned
              </li>
              <li>
                <Check size={17} /> Approved and settled amounts kept separate
              </li>
            </ul>
            <Link href="/get-started?type=FACILITY" className="text-link">
              Talk about your facility <ArrowRight size={18} />
            </Link>
          </article>
          <article className="navy-panel">
            <SceneImage scene="insurer-review" className="benefit-scene" />
            <span className="eyebrow">For insurance companies</span>
            <h2>
              Keep control.
              <br />
              Gain a clearer view.
            </h2>
            <p>
              Review structured evidence, resolve findings and authorize payment
              within your organization’s policies. LUX supports the process;
              your team makes the decisions.
            </p>
            <ul className="checklist">
              <li>
                <Check size={17} /> Coverage and tariff context
              </li>
              <li>
                <Check size={17} /> Human review for every pilot claim
              </li>
              <li>
                <Check size={17} /> Traceable payment authorizations
              </li>
            </ul>
            <Link href="/get-started?type=INSURER" className="text-link">
              Explore an insurer pilot <ArrowRight size={18} />
            </Link>
          </article>
        </div>
      </section>
      <section className="section soft">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">How it works</span>
              <h2>
                A clear next step.
                <br />
                At every stage.
              </h2>
            </div>
            <Link className="text-link" href="/how-it-works">
              Follow the full journey <ArrowRight size={18} />
            </Link>
          </div>
          <div className="journey-photo-row">
            <SceneImage scene="coverage-check" />
            <div>
              <ProcessDiagram />
              <p className="large-copy">
                The right context. Before the next step.
              </p>
              <p>
                From a patient’s coverage check to an insurer’s decision and
                Orange Money reconciliation, each organization can see the part
                of the record it is authorized to use.
              </p>
            </div>
          </div>
          <Process />
        </div>
      </section>
      <section className="section container payment-section">
        <div className="payment-label">
          <span className="eyebrow">Intended payment channel</span>
          <h2>
            Orange Money.
            <br />
            Connected responsibly.
          </h2>
          <span className="badge">Live integration not yet enabled</span>
        </div>
        <div>
          <p className="large-copy">
            Approval is a decision.
            <br />
            Settlement needs confirmation.
          </p>
          <p>
            The insurer authorizes payment through a supported, contracted
            Orange Money process. LUX tracks the instruction and verified
            evidence, while keeping review time separate from settlement time.
          </p>
          <p>
            No Orange Money PIN is collected by LUX. No patient wallet. No
            invented payment success.
          </p>
          <Link href="/partners" className="text-link">
            Understand the integration status <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <OrangeMoneyStory />
      <section className="section soft">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A look at the workspace</span>
              <h2>
                Useful detail.
                <br />
                Not another disconnected record.
              </h2>
            </div>
            <span className="subtle">Synthetic product demonstration</span>
          </div>
          <ProductPreview />
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">The people behind LUX</span>
            <h2>
              A shared focus.
              <br />A connected team.
            </h2>
          </div>
          <Link href="/team" className="text-link">
            Meet all five members <ArrowRight size={18} />
          </Link>
        </div>
        <TeamCards preview />
      </section>
      <section className="section soft">
        <div className="container faq-layout">
          <div>
            <span className="eyebrow">Good questions</span>
            <h2>Clarity starts here.</h2>
            <p>What to know before your organization joins the conversation.</p>
          </div>
          <FAQ />
        </div>
      </section>
      <CTA />
    </>
  );
}
