import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { formatMinor, decimalMinor } from '../lib/money';
import { Feedback } from '../components/Feedback';
import { FeeDisclosure } from '../components/FeeDisclosure';
type Capabilities = {
  available: boolean;
  currencies: string[];
  international: boolean;
  mode: string;
  label: string;
  restrictions: string;
};
type Payment = {
  id: string;
  kind: string;
  amountMinor: string;
  feeMinor: string;
  totalMinor: string;
  currency: string;
  status: string;
  beneficiaryLabel: string;
  categories: string[];
  restrictions: string;
  mode: string;
  simulationLabel: string | null;
  receiptNumber: string | null;
  createdAt: string;
  confirmedAt: string | null;
  quoteExpiresAt: string;
  direction?: string;
};
type Goal = {
  id: string;
  label: string;
  currency: string;
  target_minor: string;
  confirmed_minor: string;
};
type Guidance = {
  id: string;
  currency: string;
  weekly_minor: string;
  status: string;
  basis: {
    explanation: string;
    method: string;
    weeks: number;
    targetMinor: string;
    confirmedMinor: string;
  };
};
type Snapshot = {
  goals: Goal[];
  payments: Payment[];
  links: { id: string; beneficiary_label: string; expires_at: string; revoked_at: string | null }[];
  consent: boolean;
  guidance: Guidance[];
  capabilities: Capabilities;
};
type Support = {
  beneficiaryLabel: string;
  currencies: string[];
  categories: string[];
  restrictions: string;
  expiresAt: string;
  capabilities: Capabilities;
};
export function FundingPage({ mode }: { mode: 'save' | 'support' | 'history' | 'contribute' }) {
  const location = useLocation();
  const token = location.hash.slice(1);
  const [data, setData] = useState<Snapshot>();
  const [support, setSupport] = useState<Support>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [currency, setCurrency] = useState('LRD');
  const [amount, setAmount] = useState('');
  const [goalId, setGoalId] = useState('');
  const [international, setInternational] = useState(false);
  const [quote, setQuote] = useState<Payment>();
  const [receipt, setReceipt] = useState<Payment>();
  const [share, setShare] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [days, setDays] = useState('30');
  const [goalLabel, setGoalLabel] = useState('');
  const [target, setTarget] = useState('');
  const [weeks, setWeeks] = useState('12');
  const [guidanceGoal, setGuidanceGoal] = useState('');
  const keys = useRef(new Map<string, string>());
  const lock = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const request =
      mode === 'contribute'
        ? apiPost<Support>('/api/funding/resolve', { token })
        : apiGet<Snapshot>('/api/funding');
    request
      .then((value) => {
        if (!active) return;
        if (mode === 'contribute') {
          const s = value as Support;
          setSupport(s);
          setCurrency(s.currencies[0] ?? 'LRD');
        } else setData(value as Snapshot);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, token, reload]);
  useEffect(() => {
    if (quote) reviewHeading.current?.focus();
  }, [quote]);
  const caps = support?.capabilities ?? data?.capabilities;
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete the request. Retry.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function once<T>(path: string, body: Record<string, unknown>) {
    const signature = path + JSON.stringify(body);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    const result = await apiPost<T>(path, { ...body, key });
    keys.current.delete(signature);
    return result;
  }
  function refresh() {
    setReload((v) => v + 1);
  }
  function review(e: FormEvent) {
    e.preventDefault();
    void action(async () => {
      setQuote(
        await once<Payment>('/api/funding/quotes', {
          kind: mode === 'contribute' ? 'contribution' : 'deposit',
          amountMinor: decimalMinor(amount),
          currency,
          international,
          ...(mode === 'contribute' ? { token } : goalId ? { goalId } : {}),
        }),
      );
    });
  }
  const title = {
    save: 'Save Money',
    support: 'Get Support',
    history: 'Funding history',
    contribute: 'Contribute to care',
  }[mode];
  return (
    <section className="workspace flow-layout">
      <div className="page-heading">
        <div>
          <p className="eyebrow">HealthWallet funding</p>
          <h1>{title}</h1>
          <p>Pending payments are not available to spend. Every currency is tracked separately.</p>
        </div>
      </div>
      {loading && <Feedback kind="loading" title="Loading funding information…" />}
      {error && (
        <Feedback kind="error" title={error}>
          <div className="button-row">
            <button className="btn btn--ghost" disabled={busy} onClick={refresh}>
              Refresh status
            </button>
            <Link
              className="text-link"
              to="/account"
              state={{ returnTo: location.pathname + location.hash }}
            >
              Sign in
            </Link>
          </div>
          <p>
            If sign-in is required, return to this page afterward. Retry a submitted action using
            the same details.
          </p>
        </Feedback>
      )}
      {message && <Feedback kind="success" title={message} />}
      {busy && <Feedback kind="loading" title="Processing your request…" />}
      {caps && (
        <aside className="panel">
          <strong>{caps.label}</strong>
          <p>{caps.restrictions}</p>
          {!caps.available && (
            <Feedback kind="unavailable" title="Live funding is not connected yet" />
          )}
        </aside>
      )}
      {mode === 'save' && <FeeDisclosure />}
      {(mode === 'save' || mode === 'contribute') && caps && (
        <>
          {support && (
            <article className="panel">
              <h2>Intended beneficiary: {support.beneficiaryLabel}</h2>
              <p>
                This is a limited label chosen by the beneficiary. Confirm the link with them
                privately before contributing.
              </p>
              <p>
                Restrictions:{' '}
                {support.categories.length
                  ? support.categories.join(', ')
                  : 'All supported healthcare categories'}
                . No medical details are shared.
              </p>
              <p>Link expires {new Date(support.expiresAt).toLocaleString()}.</p>
            </article>
          )}
          {!quote ? (
            <article className="panel">
              <h2>{mode === 'save' ? 'Make a deposit' : 'Choose your contribution'}</h2>
              <form className="app-form" onSubmit={review}>
                {mode === 'save' && (
                  <>
                    <label htmlFor="deposit-goal">Saving goal</label>
                    <select
                      id="deposit-goal"
                      value={goalId}
                      onChange={(e) => {
                        setGoalId(e.target.value);
                        const g = data?.goals.find((g) => g.id === e.target.value);
                        if (g) setCurrency(g.currency);
                      }}
                    >
                      <option value="">General healthcare savings</option>
                      {data?.goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label} ({g.currency})
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label htmlFor="funding-currency">Currency</label>
                <select
                  id="funding-currency"
                  value={currency}
                  disabled={!!goalId || busy}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {(support?.currencies ?? caps.currencies)
                    .filter((c) => caps.currencies.includes(c))
                    .map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                </select>
                <label htmlFor="funding-amount">Amount ({currency})</label>
                <input
                  id="funding-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  required
                  aria-describedby="funding-amount-help"
                />
                <p id="funding-amount-help">
                  Use up to two decimal places. Fees and restrictions appear before authorization.
                </p>
                {mode === 'contribute' && caps.international && (
                  <label>
                    <input
                      type="checkbox"
                      checked={international}
                      onChange={(e) => setInternational(e.target.checked)}
                    />{' '}
                    International contribution {caps.mode === 'sandbox' ? '(simulated only)' : ''}
                  </label>
                )}
                <button className="btn btn--primary" disabled={busy || !caps.available}>
                  Review amount and fees
                </button>
              </form>
            </article>
          ) : (
            <article className="panel">
              <ol className="progress-steps" aria-label="Funding progress">
                {['Details', 'Review and authorize', 'Payment confirmation'].map((s, i) => (
                  <li
                    key={s}
                    className={(quote.status === 'quoted' ? i === 1 : i === 2) ? 'is-current' : ''}
                    aria-current={
                      (quote.status === 'quoted' ? i === 1 : i === 2) ? 'step' : undefined
                    }
                  >
                    {s}
                  </li>
                ))}
              </ol>
              <h2 ref={reviewHeading} tabIndex={-1}>
                {quote.status === 'quoted'
                  ? 'Review before authorizing'
                  : `Payment ${quote.status}`}
              </h2>
              <PaymentDetails payment={quote} />
              {quote.status === 'quoted' ? (
                <div className="button-row">
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setQuote(
                          await apiPost<Payment>(`/api/funding/payments/${quote.id}/authorize`, {
                            accepted: true,
                          }),
                        );
                        setMessage(
                          'Authorized. Waiting for payment confirmation; available funds have not increased.',
                        );
                      })
                    }
                  >
                    Authorize {formatMinor(quote.totalMinor, quote.currency)}
                  </button>
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setQuote(undefined)}
                  >
                    Change details
                  </button>
                </div>
              ) : (
                <>
                  <p>
                    {quote.status === 'confirmed'
                      ? 'Confirmed and credited once to the beneficiary.'
                      : 'Pending or failed payments do not increase available funds.'}
                  </p>
                  <Link className="text-link" to="/history">
                    Track payment and receipt
                  </Link>
                  <button
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => {
                      setQuote(undefined);
                      setAmount('');
                      refresh();
                    }}
                  >
                    Start another payment
                  </button>
                </>
              )}
            </article>
          )}
        </>
      )}
      {mode === 'save' && data && (
        <>
          <article className="panel">
            <h2>Healthcare saving goals</h2>
            <p>
              Progress counts confirmed deposits assigned to each goal, not your current spendable
              balance.
            </p>
            {!data.goals.length && <p>No goals yet. Create your first goal below.</p>}
            {data.goals.map((g) => (
              <div key={g.id}>
                <h3>{g.label}</h3>
                <p>
                  {formatMinor(g.confirmed_minor, g.currency)} confirmed of{' '}
                  {formatMinor(g.target_minor, g.currency)}
                </p>
                <progress
                  aria-label={`${g.label} progress`}
                  max={100}
                  value={Number(
                    (BigInt(g.confirmed_minor) * 100n) / BigInt(g.target_minor) > 100n
                      ? 100n
                      : (BigInt(g.confirmed_minor) * 100n) / BigInt(g.target_minor),
                  )}
                />
              </div>
            ))}
            <form
              className="app-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await once('/api/funding/goals', {
                    label: goalLabel,
                    targetMinor: decimalMinor(target),
                    currency,
                  });
                  setGoalLabel('');
                  setTarget('');
                  setMessage('Saving goal created.');
                  refresh();
                });
              }}
            >
              <label htmlFor="goal-label">Private goal name</label>
              <input
                id="goal-label"
                maxLength={80}
                required
                value={goalLabel}
                onChange={(e) => setGoalLabel(e.target.value)}
              />
              <label htmlFor="goal-target">Target ({currency})</label>
              <input
                id="goal-target"
                inputMode="decimal"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <button className="btn btn--primary" disabled={busy}>
                Create goal
              </button>
            </form>
          </article>
          <article className="panel">
            <h2>Optional savings guidance</h2>
            <p>
              AI guidance is not connected. This transparent planning calculator uses only your
              chosen goal and its confirmed deposits. It cannot assess affordability or move money.
            </p>
            <label>
              <input
                type="checkbox"
                disabled={busy}
                checked={data.consent}
                onChange={(e) => {
                  const granted = e.target.checked;
                  void action(async () => {
                    await apiPost('/api/funding/guidance/consent', { granted });
                    setMessage(
                      granted
                        ? 'Financial guidance consent recorded.'
                        : 'Consent withdrawn; recommendations dismissed.',
                    );
                    refresh();
                  });
                }}
              />{' '}
              Allow these financial records to be used for savings suggestions. You can withdraw at
              any time.
            </label>
            {data.consent && (
              <form
                className="app-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await once('/api/funding/guidance', {
                      goalId: guidanceGoal,
                      weeks: Number(weeks),
                    });
                    setMessage('Suggestion created. Review and adjust it to suit your budget.');
                    refresh();
                  });
                }}
              >
                <label htmlFor="guidance-goal">Goal for guidance</label>
                <select
                  id="guidance-goal"
                  value={guidanceGoal}
                  onChange={(e) => setGuidanceGoal(e.target.value)}
                  required
                >
                  <option value="">Choose a goal</option>
                  {data.goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="guidance-weeks">Weeks to reach your target</label>
                <input
                  id="guidance-weeks"
                  type="number"
                  min={1}
                  max={520}
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                  required
                />
                <button className="btn btn--primary" disabled={busy}>
                  Suggest weekly savings
                </button>
              </form>
            )}
            {data.guidance.map((g) => (
              <GuidanceCard
                key={g.id}
                guidance={g}
                busy={busy}
                act={(body) =>
                  void action(async () => {
                    await apiPost(`/api/funding/guidance/${g.id}`, body);
                    setMessage('Recommendation updated. No money moved.');
                    refresh();
                  })
                }
              />
            ))}
          </article>
        </>
      )}
      {mode === 'support' && data && (
        <article className="panel">
          <h2>Create a private support link</h2>
          <p>
            Use a nickname or first name with an initial. Do not include a diagnosis, medical
            details, phone number, or full legal name. Anyone with the link can see this label.
          </p>
          <form
            className="app-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const result = await once<{ token: string }>('/api/funding/links', {
                  label,
                  currencies: ['LRD', 'USD'],
                  categories: category ? [category] : [],
                  expiresInDays: Number(days),
                });
                setShare(`${window.location.origin}/contribute#${result.token}`);
                setMessage('Support link created. Save the link now; you can revoke it below.');
                refresh();
              });
            }}
          >
            <label htmlFor="support-label">Public beneficiary label</label>
            <input
              id="support-label"
              value={label}
              maxLength={30}
              required
              onChange={(e) => setLabel(e.target.value)}
            />
            <label htmlFor="support-category">Contribution spending restriction</label>
            <select
              id="support-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All healthcare categories</option>
              {['consultation', 'medication', 'diagnostics', 'general'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label htmlFor="support-days">Link expires after (days)</label>
            <input
              id="support-days"
              type="number"
              min={1}
              max={90}
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <p>
              Accepted currencies: LRD and USD. No conversion. Category restrictions are shown
              publicly.
            </p>
            <button className="btn btn--primary" disabled={busy}>
              Create support link
            </button>
          </form>
          {share && (
            <div>
              <label htmlFor="share-link">Your support link</label>
              <input id="share-link" readOnly value={share} onFocus={(e) => e.target.select()} />
              <a className="text-link" href={share} referrerPolicy="no-referrer">
                Open contribution page
              </a>
            </div>
          )}
          <h3>Your support links</h3>
          {!data.links.length && <p>No support requests yet.</p>}
          {data.links.map((l) => (
            <div key={l.id}>
              <p>
                {l.beneficiary_label} ·{' '}
                {l.revoked_at
                  ? 'Revoked'
                  : new Date(l.expires_at).getTime() < Date.now()
                    ? 'Expired'
                    : `Expires ${new Date(l.expires_at).toLocaleDateString()}`}
              </p>
              {!l.revoked_at && (
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await apiPost(`/api/funding/links/${l.id}/revoke`, {});
                      setMessage('Link revoked. It cannot authorize new contributions.');
                      refresh();
                    })
                  }
                >
                  Revoke link
                </button>
              )}
            </div>
          ))}
        </article>
      )}
      {data && (
        <article className="panel">
          <h2>{mode === 'history' ? 'Deposits and contribution history' : 'Recent funding'}</h2>
          <button className="btn btn--ghost" disabled={busy || loading} onClick={refresh}>
            Refresh payment status
          </button>
          {!data.payments.length && (
            <Feedback title="No funding activity yet">
              <p>
                Deposits and contributions will appear here, including pending and failed payments.
              </p>
            </Feedback>
          )}
          {data.payments.map((p) => (
            <details key={p.id}>
              <summary>
                {p.kind} · {formatMinor(p.amountMinor, p.currency)} · {p.status} · {p.direction}
              </summary>
              <PaymentDetails payment={p} />
              {p.receiptNumber && (
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      setReceipt(await apiGet<Payment>(`/api/funding/payments/${p.id}/receipt`));
                      setMessage('Contribution or deposit receipt loaded.');
                    })
                  }
                >
                  View receipt
                </button>
              )}
              {p.mode === 'sandbox' && p.direction === 'sent' && p.status === 'pending' && (
                <div>
                  <p>
                    Development payment simulator: no real transfer. Choose a provider event to test
                    the result.
                  </p>
                  <div className="button-row">
                    {(['confirmed', 'failed', 'pending'] as const).map((status) => (
                      <button
                        key={status}
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await apiPost(`/api/funding/payments/${p.id}/simulate`, {
                              eventId: crypto.randomUUID(),
                              status,
                            });
                            setMessage(`Simulated ${status} event processed.`);
                            refresh();
                          })
                        }
                      >
                        Simulate {status}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </details>
          ))}
        </article>
      )}
      {receipt && (
        <article className="panel" aria-label="Funding receipt">
          <h2>Receipt {receipt.receiptNumber}</h2>
          <PaymentDetails payment={receipt} />
          <p>
            Payment confirmation is recorded separately from partner settlement. This receipt
            contains no medical records.
          </p>
          <button className="btn btn--ghost" onClick={() => setReceipt(undefined)}>
            Close receipt
          </button>
        </article>
      )}
    </section>
  );
}
function PaymentDetails({ payment: p }: { payment: Payment }) {
  return (
    <>
      <dl className="review-list">
        <div>
          <dt>Beneficiary</dt>
          <dd>{p.beneficiaryLabel}</dd>
        </div>
        <div>
          <dt>Beneficiary receives</dt>
          <dd>{formatMinor(p.amountMinor, p.currency)}</dd>
        </div>
        <div>
          <dt>Provider fee</dt>
          <dd>{formatMinor(p.feeMinor, p.currency)}</dd>
        </div>
        <div>
          <dt>Total authorized</dt>
          <dd>{formatMinor(p.totalMinor, p.currency)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{p.status}</dd>
        </div>
        <div>
          <dt>Spending categories</dt>
          <dd>{p.categories.join(', ') || 'All healthcare categories'}</dd>
        </div>
      </dl>
      {p.status === 'quoted' && (
        <p>
          Quote expires {new Date(p.quoteExpiresAt).toLocaleString()}. Review again if it expires.
        </p>
      )}
      <p>{p.restrictions}</p>
      {p.simulationLabel && (
        <p>
          <strong>{p.simulationLabel}</strong>
        </p>
      )}
      {p.receiptNumber && (
        <p>
          Receipt {p.receiptNumber} · {p.confirmedAt && new Date(p.confirmedAt).toLocaleString()}
        </p>
      )}
    </>
  );
}
function GuidanceCard({
  guidance: g,
  busy,
  act,
}: {
  guidance: Guidance;
  busy: boolean;
  act: (body: unknown) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  return (
    <div>
      <h3>
        {formatMinor(g.weekly_minor, g.currency)} weekly · {g.status}
      </h3>
      <p>
        {g.basis.method}. Target {formatMinor(g.basis.targetMinor, g.currency)}, confirmed deposits{' '}
        {formatMinor(g.basis.confirmedMinor, g.currency)}, over {g.basis.weeks} weeks.
      </p>
      <p>{g.basis.explanation}</p>
      {g.status !== 'dismissed' && (
        <form
          className="app-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const weeklyMinor = decimalMinor(value);
              setError('');
              act({ action: 'change', weeklyMinor });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label htmlFor={`guidance-${g.id}`}>Your preferred weekly amount ({g.currency})</label>
          <input
            id={`guidance-${g.id}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <button className="btn btn--ghost" disabled={busy}>
            Change suggestion
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => act({ action: 'dismiss' })}
          >
            Dismiss suggestion
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
