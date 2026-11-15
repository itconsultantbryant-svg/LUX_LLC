"use client";
import { useState, useEffect, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

const kinds = ["PATIENT", "FACILITY", "INSURER", "GENERAL"];

export function EnquiryForm() {
  const path = usePathname();
  const [kind, setKind] = useState(path === "/contact" ? "GENERAL" : "PATIENT"),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const type = new URLSearchParams(location.search).get("type");
    if (kinds.includes(type || "")) setKind(type!);
    else if (path === "/contact") setKind("GENERAL");
  }, [path]);
  const isPatient = kind === "PATIENT";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/v1/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, kind, consent: data.consent === "on" }),
      });
      const body = await res.json();
      if (!res.ok)
        throw Error(body.message || "Unable to record your enquiry.");
      setStatus(body.message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection unavailable. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (status)
    return (
      <div className="success-panel" role="status">
        <CheckCircle2 size={36} />
        <h2>Enquiry recorded.</h2>
        <p>{status}</p>
        <button className="button secondary" onClick={() => setStatus("")}>
          Send another enquiry
        </button>
      </div>
    );
  return (
    <form className="enquiry-form" onSubmit={submit}>
      <div className="lux-form-head">
        <span className="lux-eyebrow">
          {path === "/contact" ? "Contact LUX" : "Registration enquiry"}
        </span>
        <h2>
          {path === "/contact"
            ? "Tell us how we can help."
            : "Start with a few details."}
        </h2>
        <p>
          {path === "/contact"
            ? "Share the workflow you want to improve and the right LUX contact will follow up."
            : "Choose the option that fits you best. We will route your request to the right team."}
        </p>
      </div>
      <fieldset>
        <legend>I’m getting in touch for</legend>
        <div className="type-choices">
          {[
            ["PATIENT", "Patient / family"],
            ["FACILITY", "Health facility"],
            ["INSURER", "Insurance company"],
            ["GENERAL", "General enquiry"],
          ].map(([v, l]) => (
            <label key={v} className={kind === v ? "selected" : ""}>
              <input
                type="radio"
                name="kind"
                value={v}
                checked={kind === v}
                onChange={() => setKind(v)}
              />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          {isPatient
            ? "Community, employer or organization"
            : "Organization name"}
          <input
            name="organization"
            required
            minLength={2}
            maxLength={160}
            autoComplete={isPatient ? "off" : "organization"}
          />
          {isPatient && (
            <small>
              Enter your community, employer, or “Individual” if you are
              registering for yourself.
            </small>
          )}
        </label>
        <label>
          {isPatient ? "Your name" : "Contact name"}
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label>
          {isPatient ? "Email" : "Work email"}
          <input
            type="email"
            name="email"
            required
            maxLength={200}
            autoComplete="email"
          />
        </label>
        <label>
          {isPatient ? "Mobile number" : "Telephone"}
          <input
            type="tel"
            name="phone"
            required
            minLength={7}
            maxLength={32}
            autoComplete="tel"
          />
        </label>
        <label className="full">
          {isPatient ? "City or county" : "Location"}
          <input
            name="location"
            required
            minLength={2}
            maxLength={180}
            autoComplete="address-level2"
          />
        </label>
        <label className="full">
          How can we help?
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={2000}
            rows={5}
          />
          <small>
            {isPatient
              ? "Tell us what cover you are looking for and who it is for."
              : "Tell us about your organization, current workflow and what you would like to improve."}
          </small>
        </label>
      </div>
      <label className="honeypot" aria-hidden="true">
        Leave empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="consent">
        <input name="consent" type="checkbox" required />
        <span>
          I agree that LUX HealthPay may store and review these contact details
          to respond to this enquiry. See our{" "}
          <a href="/privacy">privacy notice</a>.
        </span>
      </label>
      {error && (
        <p role="alert" className="error-notice">
          {error}
        </p>
      )}
      <button className="lux-btn" disabled={busy}>
        {busy ? "Sending…" : "Send enquiry"}
        <ArrowUpRight size={18} />
      </button>
    </form>
  );
}
