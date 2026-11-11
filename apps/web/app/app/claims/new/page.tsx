"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  useWorkspace,
  useData,
  useAction,
  Feedback,
  money,
} from "../../../../components/workspace";
export default function NewClaim() {
  const { api, org } = useWorkspace();
  const { data: patients } = useData("/patients");
  const { data: contracts } = useData("/contracts");
  const { data: encounters } = useData("/encounters");
  const action = useAction();
  const [step, setStep] = useState(0),
    [patient, setPatient] = useState(""),
    [insurer, setInsurer] = useState(""),
    [eligibility, setEligibility] = useState<any>(null),
    [encounter, setEncounter] = useState<any>(null),
    [draft, setDraft] = useState<any>(null),
    [items, setItems] = useState([
      {
        code: "PILOT-CONSULT",
        description: "Outpatient consultation",
        quantity: 1,
        unitMinor: "2500",
      },
    ]),
    [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false),
    [saved, setSaved] = useState("");
  useEffect(() => {
    let cancelled = false;
    api("/claim-drafts")
      .then((r) => {
        if (cancelled) return;
        if (r?.payload) {
          const d = r.payload;
          setPatient(d.patient);
          setInsurer(d.insurer);
          setEligibility(d.eligibility);
          setEncounter(d.encounter);
          setDraft(d.draft);
          setItems(d.items);
          setStep(d.step);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      api("/claim-drafts", {
        method: "PUT",
        body: JSON.stringify({
          step,
          patient,
          insurer,
          eligibility,
          encounter,
          draft,
          items,
        }),
      })
        .then(() => setSaved("Draft progress saved to your organization."))
        .catch(() =>
          setSaved(
            "Autosave unavailable. Keep this page open and retry before leaving.",
          ),
        );
    }, 900);
    return () => clearTimeout(timer);
  }, [
    api,
    hydrated,
    step,
    patient,
    insurer,
    eligibility,
    encounter,
    draft,
    items,
  ]);
  const total = items.reduce(
    (n, i) =>
      n +
      BigInt(i.quantity || 0) *
        BigInt(/^\d+$/.test(i.unitMinor) ? i.unitMinor : 0),
    0n,
  );
  async function check() {
    const r = await action.run("/eligibility-checks", {
      patientId: patient,
      insurerId: insurer,
    });
    if (r) {
      setEligibility(r);
      setStep(1);
    }
  }
  async function saveEncounter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const r = await action.run("/encounters", {
      patientId: patient,
      serviceDate: d.serviceDate,
      diagnosis: d.diagnosis,
      notes: d.notes,
      prescription: [],
    });
    if (r) {
      setEncounter(r);
      setStep(2);
    }
  }
  async function saveDraft() {
    const r = await action.run("/claims", {
      patientId: patient,
      insurerId: insurer,
      encounterId: encounter.id,
      eligibilityId: eligibility.id,
      currency: "USD",
      items,
    });
    if (r) {
      setDraft(r);
      setStep(3);
    }
  }
  async function attach(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const d = new FormData(e.currentTarget);
    const file = d.get("file") as File;
    if (!file.size) return;
    try {
      const p = await api(`/claims/${draft.id}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          documentType: d.get("documentType"),
          contentType: file.type,
          size: file.size,
        }),
      });
      const upload = await fetch(p.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw Error("Upload failed.");
      await api(`/attachments/${p.id}/complete`, {
        method: "POST",
        body: "{}",
      });
      action.setMessage(
        "Uploaded to quarantine. Evidence cannot be used until content and malware checks succeed.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload unavailable");
    }
  }
  return (
    <>
      <div className="app-title">
        <div>
          <h1>Prepare a claim</h1>
          <p>Local pilot catalogue · USD · No treatment recommendations</p>
          <p role="status">{saved}</p>
        </div>
        <button
          className="button secondary"
          disabled={!hydrated}
          onClick={() => {
            setStep(0);
            setPatient("");
            setInsurer("");
            setEligibility(null);
            setEncounter(null);
            setDraft(null);
            setItems([
              {
                code: "PILOT-CONSULT",
                description: "Outpatient consultation",
                quantity: 1,
                unitMinor: "2500",
              },
            ]);
          }}
        >
          Start a fresh draft
        </button>
      </div>
      <ol className="wizard-steps">
        {[
          "Patient & coverage",
          "Encounter",
          "Itemized bill",
          "Evidence & review",
        ].map((s, i) => (
          <li className={i === step ? "current" : ""} key={s}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Feedback action={action} />
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        {step === 0 && (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <h2>Patient and insurer</h2>
            <label>
              Authorized patient
              <select
                value={patient}
                required
                onChange={(e) => setPatient(e.target.value)}
              >
                <option value="">Choose a patient</option>
                {patients?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contracted insurer
              <select
                value={insurer}
                required
                onChange={(e) => setInsurer(e.target.value)}
              >
                <option value="">Choose an insurer</option>
                {contracts?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={action.busy}>
              Check insurer coverage
            </button>
          </form>
        )}
        {step === 1 && (
          <>
            <div className="notice">
              Eligibility: <b>{eligibility.status}</b> · Source:{" "}
              {eligibility.source}.{" "}
              {eligibility.status !== "ACTIVE"
                ? "Uncertain or inactive coverage requires insurer review."
                : "This snapshot does not guarantee claim approval."}
            </div>
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const id = String(
                  new FormData(e.currentTarget).get("encounterId"),
                );
                setEncounter({ id });
                setStep(2);
              }}
            >
              <label>
                Use an authorized clinician’s existing encounter
                <select name="encounterId" required>
                  <option value="">Choose this patient’s encounter</option>
                  {encounters
                    ?.filter((e: any) => e.patient_id === patient)
                    .map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.service_date.slice(0, 10)} · {e.diagnosis}
                      </option>
                    ))}
                </select>
              </label>
              <button className="button secondary">
                Use recorded encounter
              </button>
            </form>
            {org.permissions.includes("encounters.write") ? (
              <form
                className="stack-form"
                onSubmit={saveEncounter}
                style={{ marginTop: 28 }}
              >
                <h2>Encounter documentation</h2>
                <label>
                  Service date
                  <input
                    type="date"
                    name="serviceDate"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Diagnosis / encounter description
                  <input name="diagnosis" required minLength={3} />
                </label>
                <label>
                  Clinical notes
                  <textarea name="notes" minLength={3} required rows={5} />
                </label>
                <p>
                  No prescribing recommendations are generated. Use an
                  authorized clinician’s documentation.
                </p>
                <button className="button" disabled={action.busy}>
                  Save encounter & continue
                </button>
              </form>
            ) : (
              <div className="notice">
                Only staff with the clinician encounter-writing permission may
                author clinical documentation. Ask an authorized clinician to
                record the encounter, then select it above.
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              saveDraft();
            }}
          >
            <h2>Itemized bill</h2>
            <p>
              Amounts are integer USD cents, recomputed on the server. PILOT
              codes are local catalogue entries, not official medical codes.
            </p>
            {items.map((item, i) => (
              <div className="form-grid" key={i}>
                <label>
                  Service code
                  <input
                    required
                    value={item.code}
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i ? { ...v, code: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Description
                  <input
                    required
                    value={item.description}
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i ? { ...v, description: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={item.quantity}
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Unit amount (USD cents)
                  <input
                    pattern="[0-9]+"
                    required
                    value={item.unitMinor}
                    onChange={(e) =>
                      setItems(
                        items.map((v, j) =>
                          j === i ? { ...v, unitMinor: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setItems([
                  ...items,
                  { code: "", description: "", quantity: 1, unitMinor: "0" },
                ])
              }
            >
              + Add bill item
            </button>
            <p>
              Total: <b>{money(String(total))}</b>
            </p>
            <button className="button" disabled={action.busy}>
              Save draft & review evidence
            </button>
          </form>
        )}
        {step === 3 && draft && (
          <>
            <h2>Draft saved: {draft.reference}</h2>
            <p>
              The claim is not submitted yet. Add any insurer-required evidence.
              Quarantined uploads must pass scanning before use.
            </p>
            <form className="stack-form" onSubmit={attach}>
              <label>
                Document type
                <input
                  name="documentType"
                  placeholder="e.g. treatment-summary"
                  required
                />
              </label>
              <label>
                Evidence file (PDF, PNG or JPEG, up to 10 MB)
                <input
                  name="file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  required
                />
              </label>
              <button className="button secondary">
                Upload to private quarantine
              </button>
            </form>
            <div className="notice">
              Patient:{" "}
              {patients?.find((p: any) => p.id === patient)?.display_name}
              <br />
              Insurer: {contracts?.find((c: any) => c.id === insurer)?.name}
              <br />
              Eligibility: {eligibility.status}
              <br />
              Bill: {items.length} item(s) ·{" "}
              {money(draft.submitted_minor, draft.currency)}
            </div>
            <a className="button" href={"/app/claims/" + draft.id}>
              Open full summary & submit →
            </a>
          </>
        )}
      </section>
    </>
  );
}
