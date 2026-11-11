"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { SceneImage } from "./scene-image";
import { scenes, type SceneKey } from "../lib/scenes";
const slides: {
  scene: SceneKey;
  label: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
}[] = [
  {
    scene: "patient-care",
    label: "People first. Records connected.",
    title: "Clear claims. Connected care.",
    detail:
      "LUX HealthPay connects health facilities and insurers through structured claims, AI-assisted validation and payment tracking through Orange Money.",
    cta: "Get Started",
    href: "/get-started",
  },
  {
    scene: "facility-claims",
    label: "For health facilities",
    title: "More clarity. From the first record.",
    detail:
      "Check insurer-sourced coverage, bring treatment documentation together and prepare an itemized claim with a clear next step.",
    cta: "Connect your facility",
    href: "/get-started?type=FACILITY",
  },
  {
    scene: "insurer-review",
    label: "For insurance companies",
    title: "A clearer view. Decisions stay yours.",
    detail:
      "Review structured claim records, resolve findings and keep an auditable history. Every pilot claim still requires human insurer authorization.",
    cta: "Explore an insurer pilot",
    href: "/get-started?type=INSURER",
  },
  {
    scene: "orange-money-coordination",
    label: "Orange Money · Intended payment channel",
    title: "Authorize with care. Track with evidence.",
    detail:
      "Follow insurer-to-facility Orange Money payment instructions through confirmation and reconciliation. The current demonstration simulates payments; no real funds move.",
    cta: "See the payment journey",
    href: "/how-it-works",
  },
];
export function HeroCarousel({
  title,
  intro,
}: {
  title?: string;
  intro?: string;
}) {
  const [active, setActive] = useState(0),
    [paused, setPaused] = useState(true),
    [reduced, setReduced] = useState(false),
    [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    setPaused(m.matches);
    const change = () => {
      setReduced(m.matches);
      if (m.matches) setPaused(true);
    };
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        setActive((i) => (i + 1) % slides.length);
    }, 9000);
    return () => clearInterval(id);
  }, [paused, reduced]);
  function choose(i: number) {
    const next = (i + slides.length) % slides.length;
    setActive(next);
    setPaused(true);
    setAnnouncement(
      `Slide ${next + 1} of ${slides.length}: ${slides[next].label}`,
    );
  }
  const current = slides[active];
  return (
    <section
      className="photo-hero"
      role="region"
      aria-roledescription="carousel"
      aria-label="LUX HealthPay healthcare journey"
      onFocusCapture={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
    >
      <div className="hero-photo-layers" aria-hidden="true">
        {slides.map((slide, i) => (
          <div
            className={"hero-photo-layer" + (active === i ? " is-active" : "")}
            key={slide.scene}
          >
            <SceneImage
              scene={slide.scene}
              priority={i === 0}
              caption={false}
            />
          </div>
        ))}
      </div>
      <div className="hero-shade" />
      <div className="container photo-hero-content">
        <div className="photo-hero-copy" key={active}>
          <span className="eyebrow">
            <i />
            {current.label}
          </span>
          <h1>{active === 0 && title ? title : current.title}</h1>
          <p className="lead">
            {active === 0 && intro ? intro : current.detail}
          </p>
          <div className="button-row">
            <Link className="button" href={current.href}>
              {current.cta}
              <ArrowUpRight size={19} />
            </Link>
            <Link className="text-link" href="/how-it-works">
              See How It Works
              <ArrowRight size={18} />
            </Link>
          </div>
          <p className="photo-hero-note">
            Insurer-led decisions. Traceable records. No custodial wallet.
          </p>
        </div>
        <div className="hero-carousel-controls">
          <div className="hero-pagination">
            <span>{String(active + 1).padStart(2, "0")} / 04</span>
            {slides.map((s, i) => (
              <button
                key={s.scene}
                aria-label={`Show slide ${i + 1}: ${s.label}`}
                aria-current={active === i ? "true" : undefined}
                onClick={() => choose(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <div className="hero-arrow-controls">
            <button
              aria-label="Previous slide"
              onClick={() => choose(active - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button aria-label="Next slide" onClick={() => choose(active + 1)}>
              <ChevronRight size={20} />
            </button>
            <button
              aria-label={
                paused ? "Start slide rotation" : "Pause slide rotation"
              }
              aria-pressed={!paused}
              onClick={() => setPaused(!paused)}
              disabled={reduced}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </div>
        </div>
      </div>
      <div className="hero-image-disclosure">
        {scenes[current.scene].caption} ·{" "}
        <a
          href={scenes[current.scene].source}
          target="_blank"
          rel="noopener noreferrer"
        >
          {scenes[current.scene].author}
        </a>{" "}
        ·{" "}
        <a
          href={scenes[current.scene].licenseUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {scenes[current.scene].license}
        </a>
        <br />
        Resized/cropped · Context photograph, not a LUX customer or transaction
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
