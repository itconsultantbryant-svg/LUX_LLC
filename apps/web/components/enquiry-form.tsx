"use client";
import { useState, useEffect, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
export function EnquiryForm() {
  const [kind, setKind] = useState("FACILITY"),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("type");
    if (["FACILITY", "INSURER", "GENERAL"].includes(t || "")) setKind(t!);
  }, []);
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
      <fieldset>
        <legend>I’m getting in touch for</legend>
        <div className="type-choices">
          {[
            ["FACILITY", "Health Facility"],
            ["INSURER", "Insurance Company"],
            ["GENERAL", "General Enquiry"],
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
          Organization name
          <input
            name="organization"
            required
            minLength={2}
            maxLength={160}
            autoComplete="organization"
          />
        </label>
        <label>
          Contact name
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label>
          Work email
          <input
            type="email"
            name="email"
            required
            maxLength={200}
            autoComplete="email"
          />
        </label>
        <label>
          Telephone
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
          Location
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
            Organization needs only. No patient or medical information.
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
      <button className="button" disabled={busy}>
        {busy ? "Recording…" : "Send enquiry"}
        <ArrowUpRight size={18} />
      </button>
      <p className="subtle">
        Stored for operator review. Email delivery is not implied.
      </p>
    </form>
  );
}
