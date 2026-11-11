import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileCheck2,
  ClipboardList,
  SearchCheck,
  Landmark,
  ArrowUpRight,
} from "lucide-react";
import { team as fallback, publicData, steps, faqs } from "../lib/content";
import { TeamGallery } from "./team-gallery";
import { SceneImage } from "./scene-image";
import type { SceneKey } from "../lib/scenes";
export function CTA() {
  return (
    <section className="cta-band">
      <div className="container cta-inner">
        <div>
          <span className="eyebrow">Start a conversation</span>
          <h2>
            Better connected.
            <br />
            From the first claim.
          </h2>
          <p>
            Let’s explore what a focused pilot could look like for your
            organization.
          </p>
        </div>
        <Link className="button dark" href="/get-started">
          Discuss the pilot <ArrowUpRight size={20} />
        </Link>
      </div>
    </section>
  );
}
export function Intro({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  const scenes: Record<string, SceneKey> = {
    "Our services": "facility-claims",
    "How it works": "coverage-check",
    "About LUX HealthPay": "partner-collaboration",
    "Partner opportunities": "insurer-review",
    "Get started": "patient-care",
    Contact: "patient-care",
  };
  const scene = scenes[label];
  return (
    <section className={"page-intro" + (scene ? " page-intro-photo" : "")}>
      <div className={"container" + (scene ? " intro-photo-grid" : "")}>
        <div>
          <span className="eyebrow">
            <i /> {label}
          </span>
          <h1>{title}</h1>
          <p className="lead">{text}</p>
        </div>
        {scene && <SceneImage scene={scene} priority className="intro-scene" />}
      </div>
    </section>
  );
}
export function Process({ full = false }: { full?: boolean }) {
  return (
    <ol className={full ? "process-full" : "process-short"}>
      {(full ? steps : steps.filter((_, i) => [1, 2, 3, 6].includes(i))).map(
        ([title, text], i) => (
          <li key={title}>
            <span className="step-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}
export function ProcessDiagram() {
  return (
    <div
      className="process-diagram"
      aria-label="Facility prepares a claim, LUX validates records, insurer reviews and authorizes, Orange Money processes payment, verified confirmation supports reconciliation"
    >
      {[
        [ClipboardList, "Facility", "Prepare"],
        [SearchCheck, "LUX", "Validate"],
        [Landmark, "Insurer", "Decide & authorize"],
        [FileCheck2, "Orange Money", "Process · confirm · reconcile"],
      ].map(([Icon, title, text]: any, i) => (
        <div key={title}>
          <Icon size={26} />
          <strong>{title}</strong>
          <span>{text}</span>
          {i < 3 && <ArrowRight className="diagram-arrow" size={20} />}
        </div>
      ))}
    </div>
  );
}
export async function TeamCards({ preview = false }: { preview?: boolean }) {
  const stored = await publicData("team");
  const members = Array.isArray(stored)
    ? stored
    : fallback.map((t) => ({
        ...t,
        photo: "/media/" + t.photo,
        alt: `Portrait of ${t.name}`,
      }));
  return <TeamGallery members={members.slice(0, preview ? 3 : 5)} />;
}
export async function FAQ() {
  const published = await publicData("pages/faq");
  const entries =
    published?.content?.sections?.map((s: any) => [s.title, s.text]) || faqs;
  return (
    <div className="faq">
      {entries.map(([q, a]: string[]) => (
        <details key={q}>
          <summary>
            {q}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
export function ProductPreview() {
  return (
    <div className="product-preview">
      <div className="preview-top">
        <span className="mini-mark">L</span>
        <b>LUX HealthPay</b>
        <span className="badge demo">SYNTHETIC DEMONSTRATION</span>
      </div>
      <div className="preview-body">
        <aside>
          <span>WORKSPACE</span>
          <b>Overview</b>
          <span>Claims</span>
          <span>Payments</span>
          <span>Reconciliation</span>
        </aside>
        <div className="preview-content">
          <span className="eyebrow">Facility workspace</span>
          <h3>A claim, without the guesswork.</h3>
          <div className="preview-record">
            <div>
              <small>DEMO CLAIM</small>
              <strong>DEMO-LHP-0003</strong>
            </div>
            <span className="badge">Awaiting insurer review</span>
          </div>
          <ul className="checklist">
            <li>
              <Check size={16} /> Encounter and bill submitted
            </li>
            <li>
              <Check size={16} /> Validation findings available
            </li>
            <li>
              <span className="open-dot" /> Human insurer decision required
            </li>
          </ul>
          <div className="preview-note">
            Illustrative UI · Synthetic information only · No payment initiated
          </div>
        </div>
      </div>
    </div>
  );
}
