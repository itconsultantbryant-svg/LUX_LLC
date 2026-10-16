import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { formatMinor } from '../lib/money';

type FeeLine = {
  code: string;
  label: string;
  amountMinor: string;
  currency: string;
  basis: string;
};
type FeeSchedule = {
  version: string;
  status: string;
  currency: string;
  lines: FeeLine[];
  note: string;
};

export function FeeDisclosure() {
  const [fees, setFees] = useState<FeeSchedule>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiGet<FeeSchedule>('/api/fees')
      .then((value) => {
        if (active) setFees(value);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Fee schedule unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);
  if (!fees && !error) return null;
  return (
    <details className="panel fee-disclosure">
      <summary>
        Fees and charges ({fees?.status === 'sandbox' ? 'sandbox schedule' : fees?.version})
      </summary>
      {error && <p>{error}</p>}
      {fees && (
        <>
          <ul>
            {fees.lines.map((line) => (
              <li key={line.code}>
                <strong>{line.label}</strong> — {formatMinor(line.amountMinor, line.currency)} ·{' '}
                {line.basis}
              </li>
            ))}
          </ul>
          <p>{fees.note}</p>
        </>
      )}
    </details>
  );
}
