import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { formatMinor } from '../lib/money';
import { Icon } from './icons/Icon';
import './OrangeTopUp.css';

export type TopUpPayment = {
  id: string;
  amountMinor: string;
  totalMinor: string;
  currency: string;
  status: string;
  beneficiaryLabel: string;
};

type Phase =
  'checking' | 'connecting' | 'awaiting' | 'confirming' | 'crediting' | 'done' | 'failed';

const STEPS: Array<{ phase: Phase; label: string }> = [
  { phase: 'connecting', label: 'Contacting Orange Money' },
  { phase: 'awaiting', label: 'Confirm the request in your Orange Money app' },
  { phase: 'confirming', label: 'Confirming the transfer from Orange Money' },
  { phase: 'crediting', label: 'Crediting your Health Wallet' },
];

const ORDER: Phase[] = ['connecting', 'awaiting', 'confirming', 'crediting', 'done'];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Real-time, sandboxed Orange Money → Health Wallet top-up.
 *
 * The assistant has already created and authorized the payment, so this screen
 * drives the transfer to completion, showing each step as it happens. In the
 * sandbox the "network" is a local simulation — no real money moves.
 */
export function OrangeTopUp({
  payment,
  onComplete,
  auto = true,
}: {
  payment: TopUpPayment;
  onComplete?: () => void;
  auto?: boolean;
}) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const cancelled = useRef(false);

  const returnToChat = useCallback(() => {
    try {
      sessionStorage.removeItem('lux:chat:return');
    } catch {
      /* storage may be unavailable */
    }
    navigate('/assistant');
  }, [navigate]);

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    const eventId = crypto.randomUUID();
    try {
      setPhase('connecting');
      await sleep(1100);
      if (cancelled.current) return;
      setPhase('awaiting');
      await sleep(1500);
      if (cancelled.current) return;
      setPhase('confirming');
      const result = await apiPost<TopUpPayment>(`/api/funding/payments/${payment.id}/simulate`, {
        eventId,
        status: 'confirmed',
      });
      if (cancelled.current) return;
      setPhase('crediting');
      await sleep(650);
      if (cancelled.current) return;
      setPhase('done');
      onComplete?.();
      void result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not complete the top-up.');
      setPhase('failed');
    }
  }, [onComplete, payment.id]);

  useEffect(() => {
    if (payment.status === 'confirmed') {
      setPhase('done');
      return;
    }
    if (payment.status === 'failed') {
      setError('The Orange Money transfer failed. You can try again from Add money.');
      setPhase('failed');
      return;
    }
    if (auto) {
      void run();
    } else {
      setPhase('connecting');
    }
  }, [auto, payment.status, run]);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'done') return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem('lux:chat:return') === '1';
    } catch {
      flagged = false;
    }
    if (!flagged) return;
    const timer = setTimeout(returnToChat, 2600);
    return () => clearTimeout(timer);
  }, [phase, returnToChat]);

  const currentIndex = ORDER.indexOf(phase === 'failed' ? 'confirming' : phase);

  return (
    <article className="panel topup" aria-live="polite">
      <div className="topup__head">
        <div className="topup__spinner" data-phase={phase} aria-hidden="true" />
        <div>
          <p className="eyebrow">
            <Icon name="smartphone" size={15} /> Orange Money top-up
          </p>
          <h2>
            {phase === 'done'
              ? 'Top-up complete'
              : phase === 'failed'
                ? 'Top-up needs attention'
                : `Adding ${formatMinor(payment.totalMinor, payment.currency)}`}
          </h2>
        </div>
      </div>

      {phase !== 'done' && phase !== 'failed' && (
        <ol className="topup__steps">
          {STEPS.map((step, index) => {
            const state =
              index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
            return (
              <li key={step.phase} className={`topup__step is-${state}`}>
                <span className="topup__dot" aria-hidden="true">
                  {state === 'done' ? <Icon name="check" size={13} /> : null}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>
      )}

      {phase === 'done' && (
        <p className="topup__success">
          <Icon name="check-circle" size={18} />{' '}
          {formatMinor(payment.amountMinor, payment.currency)} is now available in your Health
          Wallet. Confirmation and settlement are recorded separately.
        </p>
      )}

      {phase === 'failed' && (
        <p className="topup__error" role="alert">
          {error}
        </p>
      )}

      <dl className="topup__facts">
        <div>
          <dt>From</dt>
          <dd>Orange Money wallet</dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{payment.beneficiaryLabel}</dd>
        </div>
        <div>
          <dt>Credited to wallet</dt>
          <dd>{formatMinor(payment.amountMinor, payment.currency)}</dd>
        </div>
        <div>
          <dt>Provider fee</dt>
          <dd>
            {formatMinor(
              (BigInt(payment.totalMinor) - BigInt(payment.amountMinor)).toString(),
              payment.currency,
            )}
          </dd>
        </div>
      </dl>

      <p className="topup__note">
        SIMULATION — this sandbox moves no real money. Orange Money confirmation here is simulated.
      </p>

      <div className="button-row">
        {!auto && !started.current && phase === 'connecting' && (
          <button type="button" className="btn btn--primary" onClick={() => void run()}>
            <Icon name="smartphone" size={16} /> Start Orange Money transfer
          </button>
        )}
        {phase === 'done' && (
          <button type="button" className="btn btn--primary" onClick={returnToChat}>
            <Icon name="message-circle" size={16} /> Back to your chat
          </button>
        )}
        <Link
          className="btn btn--ghost"
          to="/history"
          onClick={() => {
            try {
              sessionStorage.removeItem('lux:chat:return');
            } catch {
              /* ignore */
            }
          }}
        >
          View funding history
        </Link>
        {phase === 'failed' && (
          <Link className="btn btn--ghost" to="/save">
            Try again
          </Link>
        )}
      </div>
    </article>
  );
}
