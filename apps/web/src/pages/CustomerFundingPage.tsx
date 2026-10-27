import { useEffect, useState, type FormEvent } from 'react';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet, apiPost } from '../lib/api';
import { decimalMinor, formatMinor } from '../lib/money';

type Wallet = { currencies: Array<{ currency: string; balances: { available: string } }> };
type Payment = {
  id: string;
  amountMinor: string;
  feeMinor: string;
  totalMinor: string;
  currency: string;
  status: string;
  simulationLabel: string | null;
};

/** Customer-only funding view. Every operation is tied to the active HTTP-only session. */
export function CustomerFundingPage({ orangeMoney = false }: { orangeMoney?: boolean }) {
  const [wallet, setWallet] = useState<Wallet>();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'LRD' | 'USD'>('LRD');
  const [pin, setPin] = useState('');
  const [quote, setQuote] = useState<Payment>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshWallet = async () => setWallet(await apiGet<Wallet>('/api/wallet'));
  useEffect(() => {
    void refreshWallet().catch((reason: Error) => setError(reason.message));
  }, []);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setQuote(
        await apiPost<Payment>('/api/funding/quotes', {
          key: crypto.randomUUID(),
          kind: 'deposit',
          amountMinor: decimalMinor(amount),
          currency,
          international: false,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the funding quote.');
    } finally {
      setBusy(false);
    }
  }

  async function authorize() {
    if (!quote) return;
    setBusy(true);
    setError('');
    try {
      setQuote(
        await apiPost<Payment>(`/api/funding/payments/${quote.id}/authorize`, {
          accepted: true,
          pin,
        }),
      );
      setMessage('Authorization submitted.');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not authorize this funding request.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmSandbox() {
    if (!quote) return;
    setBusy(true);
    setError('');
    try {
      await apiPost(`/api/funding/payments/${quote.id}/simulate`, {
        eventId: crypto.randomUUID(),
        status: 'confirmed',
      });
      await refreshWallet();
      setAmount('');
      setPin('');
      setQuote(undefined);
      setMessage('Sandbox funding confirmed. Your wallet is up to date.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not confirm the sandbox outcome.');
    } finally {
      setBusy(false);
    }
  }

  const balance = wallet?.currencies.find((item) => item.currency === currency)?.balances.available;
  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name={orangeMoney ? 'smartphone' : 'heart'} size={15} /> Customer wallet
          </p>
          <h1>{orangeMoney ? 'Orange Money' : 'Save for Health'}</h1>
          <p>Add funds to your HealthWallet.</p>
        </div>
      </header>
      {message && <Feedback kind="success" title={message} />}
      {error && <Feedback kind="error" title={error} />}
      <article className="panel">
        <small>Available balance</small>
        <p className="balance">{balance === undefined ? '—' : formatMinor(balance, currency)}</p>
      </article>
      {!quote ? (
        <form className="panel app-form" onSubmit={review}>
          <h2>Funding details</h2>
          <label htmlFor="funding-currency">Currency</label>
          <select
            id="funding-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as 'LRD' | 'USD')}
          >
            <option value="LRD">Liberian Dollar (LRD)</option>
            <option value="USD">US Dollar (USD)</option>
          </select>
          <label htmlFor="funding-amount">Amount</label>
          <input
            id="funding-amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
          <button className="btn btn--primary" disabled={busy}>
            {busy ? 'Preparing…' : 'Review funding'}
          </button>
        </form>
      ) : (
        <article className="panel">
          <h2>Review funding</h2>
          <dl>
            <dt>Amount</dt>
            <dd>{formatMinor(quote.amountMinor, quote.currency)}</dd>
            <dt>Fee</dt>
            <dd>{formatMinor(quote.feeMinor, quote.currency)}</dd>
            <dt>Total</dt>
            <dd>{formatMinor(quote.totalMinor, quote.currency)}</dd>
          </dl>
          {quote.status === 'created' && (
            <>
              <label htmlFor="orange-pin">Orange Money PIN</label>
              <input
                id="orange-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits"
              />
              <div className="button-row">
                <button
                  className="btn btn--primary"
                  disabled={busy || pin.length !== 4}
                  onClick={() => void authorize()}
                >
                  Authorize
                </button>
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setQuote(undefined)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {quote.status === 'pending' && quote.simulationLabel && (
            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void confirmSandbox()}
            >
              Confirm sandbox result
            </button>
          )}
        </article>
      )}
    </section>
  );
}
