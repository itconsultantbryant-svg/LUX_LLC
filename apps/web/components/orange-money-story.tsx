import {
  ArrowRight,
  Building2,
  Smartphone,
  Hospital,
  ShieldCheck,
} from "lucide-react";
import { SceneImage } from "./scene-image";
export function OrangeMoneyStory() {
  return (
    <section className="orange-money-story container">
      <SceneImage scene="orange-money-coordination" />
      <div className="orange-money-story-content">
        <span className="eyebrow">
          Orange Money · Insurer-to-facility workflow
        </span>
        <h2>
          From an authorized payment
          <br />
          to a traceable record.
        </h2>
        <p>
          The insurer reviews the base amount, disclosed fee policy and verified
          facility destination. Orange Money is the intended channel for the
          authorized transfer.
        </p>
        <div className="orange-money-route">
          <div>
            <Building2 size={23} />
            <strong>Insurance company</strong>
            <span>Authorizes payment</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <Smartphone size={23} />
            <strong>Orange Money</strong>
            <span>Processes through its approved channel</span>
          </div>
          <ArrowRight size={18} />
          <div>
            <Hospital size={23} />
            <strong>Health facility</strong>
            <span>Confirmed receipt is reconciled</span>
          </div>
        </div>
        <p className="notice">
          <ShieldCheck size={17} /> The current demo simulates this workflow. No
          real funds move. Real Orange Money PINs are never entered in LUX.
        </p>
        <a className="text-link" href="/how-it-works">
          Follow authorization and reconciliation
          <ArrowRight size={17} />
        </a>
      </div>
    </section>
  );
}
