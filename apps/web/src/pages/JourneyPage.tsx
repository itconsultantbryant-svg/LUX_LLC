import { useState } from 'react';
import { apiPost } from '../lib/api';
import { webConfig } from '../config';
import { Icon, type IconName } from '../components/icons/Icon';
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

const STEPS: Array<{ label: string; icon: IconName }> = [
  { label: 'Save or receive support', icon: 'wallet' },
  { label: 'Submit a healthcare bill', icon: 'receipt' },
  { label: `${webConfig.aiEngine} extracts and checks`, icon: 'sparkles' },
  { label: 'You review the details', icon: 'eye' },
  { label: 'Eligible funding is determined', icon: 'trending-up' },
  { label: 'Authorized payment proceeds', icon: 'shield-check' },
  { label: 'Receipt and audit records', icon: 'file-text' },
];

const AI_DOES = [
  'Reads the uploaded document and extracts the bill fields',
  'Shows the exact evidence for every extracted value',
  'Compares the document with the bill and flags conflicts',
  'Highlights uncertainty instead of guessing',
  'Explains an already-computed funding plan',
];

const AI_NEVER = [
  'Decides that treatment actually happened',
  'Authorizes or moves money',
  'Invents values, coverage, balances, or approvals',
  'Obeys instructions written inside a document',
  'Suppresses a review that a person should make',
];

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
          <li key={step.label}>
            <span className="journey__step-label">
              <Icon name={step.icon} size={17} />
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="journey__ai">
        <section className="journey__ai-col journey__ai-col--does">
          <h2>
            <Icon name="sparkles" size={20} /> What AI does
          </h2>
          <ul>
            {AI_DOES.map((item) => (
              <li key={item}>
                <Icon name="check-circle" size={16} /> {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="journey__ai-col journey__ai-col--never">
          <h2>
            <Icon name="shield-check" size={20} /> What AI never does
          </h2>
          <ul>
            {AI_NEVER.map((item) => (
              <li key={item}>
                <Icon name="x" size={16} /> {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

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
