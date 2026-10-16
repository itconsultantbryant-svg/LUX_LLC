import { useState } from 'react';
import { apiPost } from '../lib/api';
import { webConfig } from '../config';
import './JourneyPage.css';

type ExtractResponse = {
  simulation: boolean;
  extraction: {
    mode: string;
    confidence: number;
    fields: {
      providerName: string | null;
      totalAmountMinor: number | null;
      currency: string | null;
      serviceDate: string | null;
    };
    evidence: Array<{ field: string; note: string }>;
  };
};

const STEPS = [
  'Save or receive support',
  'Submit a healthcare bill',
  `${webConfig.aiEngine} extracts and checks`,
  'You review the details',
  'Eligible funding is determined',
  'Authorized payment proceeds',
  'Receipt and audit records',
] as const;

export function JourneyPage() {
  const [hint, setHint] = useState('Consultation total 250.00 LRD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResponse | null>(null);

  async function runSandboxExtract() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<ExtractResponse>('/api/ai/sandbox-extract', {
        hintText: hint,
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="journey">
      <header>
        <h1>Main healthcare-payment journey</h1>
        <p>
          AI does real work in extraction and checking. Accounting and payment authorization stay
          deterministic. Uncertain cases go to human review.
        </p>
      </header>

      <ol className="journey__steps">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="journey__lab">
        <h2>Try sandbox extraction</h2>
        <p>
          Calls the API sandbox adapter for {webConfig.aiEngine}. Labeled simulation only — not a
          live model claim.
        </p>
        <label>
          Bill hint text
          <textarea value={hint} onChange={(event) => setHint(event.target.value)} rows={3} />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={runSandboxExtract}
        >
          {busy ? 'Extracting…' : 'Run LUX HealthTrust sandbox extract'}
        </button>
        {error ? <p className="journey__error">{error}</p> : null}
        {result ? (
          <div className="journey__result">
            <p className="journey__sim">
              {result.simulation ? 'SIMULATION' : 'LIVE'} · mode {result.extraction.mode} ·
              confidence {(result.extraction.confidence * 100).toFixed(0)}%
            </p>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{result.extraction.fields.providerName ?? '—'}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  {result.extraction.fields.totalAmountMinor != null
                    ? `${(result.extraction.fields.totalAmountMinor / 100).toFixed(2)} ${result.extraction.fields.currency}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Service date</dt>
                <dd>{result.extraction.fields.serviceDate ?? '—'}</dd>
              </div>
            </dl>
            <ul>
              {result.extraction.evidence.map((item) => (
                <li key={`${item.field}-${item.note}`}>
                  <strong>{item.field}:</strong> {item.note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
