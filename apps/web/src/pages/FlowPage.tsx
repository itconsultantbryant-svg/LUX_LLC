import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { money, parseAmount, useDemo, type Flow } from '../features/demo';
const copy = {
  pay: {
    title: 'Pay for Care',
    intro: 'Choose your provider, review the amount, then confirm.',
    label: 'Healthcare provider',
    options: ['Demo Community Clinic', 'Demo Family Health Centre'],
    button: 'Simulate payment',
  },
  save: {
    title: 'Save Money',
    intro: 'Set aside money for your next healthcare need.',
    label: 'Savings source',
    options: ['Demo mobile wallet', 'Demo bank account'],
    button: 'Simulate savings',
  },
  support: {
    title: 'Get Support',
    intro: 'Tell us what care you need help paying for.',
    label: 'Support category',
    options: ['Consultation', 'Medication', 'Diagnostic tests'],
    button: 'Submit demo request',
  },
};
export function FlowPage({ flow }: { flow: Flow }) {
  const { state, dispatch, allowed } = useDemo();
  const config = copy[flow];
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function review(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      setError(`Choose a ${config.label.toLowerCase()} before continuing.`);
      return;
    }
    const value = parseAmount(amount);
    if (value === null) {
      setError(
        'Enter an amount from LRD 0.01 to LRD 1,000,000.00, using up to two decimal places.',
      );
      return;
    }
    if (flow === 'pay' && value > state.available) {
      setError('This exceeds your available funds. Restricted and pending funds cannot be used.');
      return;
    }
    setError('');
    setStep(1);
  }
  function complete() {
    if (busy) return;
    if (!navigator.onLine) {
      setError('You are offline. Reconnect, then retry. Nothing has been submitted.');
      return;
    }
    setError('');
    setBusy(true);
    timer.current = setTimeout(() => {
      const value = parseAmount(amount);
      if (value === null || (flow === 'pay' && value > state.available)) {
        setError('The amount is no longer available. Go back and review it.');
        setBusy(false);
        return;
      }
      dispatch({ type: 'complete', flow, amount: value, detail: `Synthetic example · ${choice}` });
      setBusy(false);
      setStep(2);
    }, 500);
  }
  return (
    <section className="workspace flow-layout">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="credit-card" size={15} /> Healthcare wallet
          </p>
          <h1>{config.title}</h1>
          <p>{config.intro}</p>
        </div>
      </div>
      {!state.active ? (
        <Feedback kind="unavailable" title="This service is not connected yet">
          <p>
            Live payments, savings, and support requests are unavailable. No money will be moved.
          </p>
          <div className="button-row">
            <Link className="btn btn--primary" to="/account">
              Customer sign in
            </Link>
            {allowed && (
              <button className="btn btn--ghost" onClick={() => dispatch({ type: 'start' })}>
                Try Demo
              </button>
            )}
            <Link className="text-link" to="/">
              Back home
            </Link>
          </div>
        </Feedback>
      ) : (
        <>
          <ol className="progress-steps" aria-label={`${config.title} progress`}>
            {['Details', 'Review', 'Confirmation'].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? 'step' : undefined}
                className={index <= step ? 'is-current' : ''}
              >
                <span aria-hidden="true">{index < step ? '✓' : index + 1}</span>
                {label}
                <span className="sr-only">
                  {index < step ? ' completed' : index === step ? ' current' : ''}
                </span>
              </li>
            ))}
          </ol>
          <div className="flow-columns">
            <article className="panel">
              <h2 ref={heading} tabIndex={-1}>
                {
                  [
                    'Enter details',
                    'Review before you confirm',
                    flow === 'support' ? 'Request received' : 'Simulation complete',
                  ][step]
                }
              </h2>
              {step === 0 ? (
                <form className="app-form" onSubmit={review} noValidate>
                  <label htmlFor="flow-choice">{config.label}</label>
                  <select
                    id="flow-choice"
                    value={choice}
                    onChange={(event) => setChoice(event.target.value)}
                    required
                    aria-describedby="flow-error"
                    aria-invalid={!!error && !choice}
                  >
                    <option value="">Choose an option</option>
                    {config.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                  <label htmlFor="flow-amount">Amount (LRD — Liberian dollars)</label>
                  <input
                    id="flow-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={!!error}
                    aria-describedby="amount-help flow-error"
                    autoComplete="off"
                    required
                  />
                  <p id="amount-help">
                    {flow === 'pay' ? `Available: ${money(state.available)}. ` : ''}Enter an amount
                    with up to two decimal places.
                  </p>
                  <button className="btn btn--primary" type="submit">
                    Review details
                  </button>
                </form>
              ) : step === 1 ? (
                <>
                  <dl className="review-list">
                    <div>
                      <dt>{config.label}</dt>
                      <dd>{choice}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>{money(parseAmount(amount) ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>Fees</dt>
                      <dd>LRD 0.00 · simulation only</dd>
                    </div>
                    <div>
                      <dt>Outcome</dt>
                      <dd>
                        {flow === 'support'
                          ? 'Pending review; not spendable funds'
                          : 'Updates your fictional wallet only'}
                      </dd>
                    </div>
                  </dl>
                  <div className="button-row">
                    <button className="btn btn--primary" disabled={busy} onClick={complete}>
                      {busy ? 'Processing simulation…' : error ? 'Retry simulation' : config.button}
                    </button>
                    <button
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => {
                        setError('');
                        setStep(0);
                      }}
                    >
                      Back to details
                    </button>
                  </div>
                  {busy && <Feedback kind="loading" title="Processing your simulation…" />}
                </>
              ) : (
                <>
                  <Feedback
                    kind="success"
                    title={
                      flow === 'support'
                        ? 'Your demo request is pending review.'
                        : `${money(parseAmount(amount) ?? 0)} ${flow === 'pay' ? 'payment' : 'savings'} simulated.`
                    }
                  >
                    <p>
                      No real money moved.{' '}
                      {flow === 'support'
                        ? 'Approval is not guaranteed. Your available balance has not changed.'
                        : 'Your demo balance and history have been updated.'}
                    </p>
                  </Feedback>
                  <div className="button-row">
                    <Link className="btn btn--primary" to="/history">
                      View history
                    </Link>
                    <Link className="btn btn--ghost" to="/">
                      Back home
                    </Link>
                  </div>
                </>
              )}
              <div id="flow-error">{error && <Feedback kind="error" title={error} />}</div>
            </article>
            <aside className="panel flow-help">
              <span className="badge badge--pending">Synthetic demo</span>
              <h2>You stay in control</h2>
              <p>
                Review the amount and destination before confirming. All amounts are in Liberian
                dollars (LRD).
              </p>
              <p>Restricted funds have eligibility rules. Pending funds cannot be spent.</p>
              <Link className="text-link" to="/">
                Cancel and return home
              </Link>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
