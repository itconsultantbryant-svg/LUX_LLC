"use client";
import { useState } from "react";
import { useAction, money } from "./workspace";
export function DemoPaymentConfirmation({ payment }: { payment: any }) {
  const [challenge, setChallenge] = useState<any>(null);
  const action = useAction();
  return (
    <div className="payment-confirmation">
      <h3>Orange Money authorization simulation</h3>
      <p>
        This is a demonstration of a provider authorization step.{" "}
        <b>Never enter your real Orange Money PIN in LUX HealthPay.</b> No real
        money is transferred.
      </p>
      {!challenge ? (
        <button
          className="button"
          disabled={action.busy}
          onClick={async () =>
            setChallenge(
              await action.run(`/payments/${payment.id}/demo-confirmation`, {}),
            )
          }
        >
          Prepare simulated Orange Money payment
        </button>
      ) : (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            await action.run(
              `/payments/${payment.id}/execute`,
              {
                challengeId: challenge.challengeId,
                demoCode: data.get("demoCode"),
              },
              challenge.paymentVersion,
            );
          }}
        >
          <p>
            Confirm the synthetic insurer-to-facility base payment of{" "}
            <b>{money(payment.base_minor, payment.currency)}</b>.
          </p>
          <div>
            <span className="subtle">Use this generated demo code:</span>
            <br />
            <output
              className="demo-code-display"
              aria-label="Generated demo authorization code"
            >
              {challenge.demoCode}
            </output>
          </div>
          <label>
            Demo authorization code — not an Orange Money PIN
            <input
              name="demoCode"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
              required
              aria-describedby="demo-confirmation-help"
            />
            <small id="demo-confirmation-help">
              Enter the four digits displayed above. Expires in two minutes;
              five attempts maximum. This is not a real payment credential.
            </small>
          </label>
          <button className="button" disabled={action.busy}>
            Confirm simulated payment
          </button>
          <button
            className="inline-button"
            type="button"
            disabled={action.busy}
            onClick={() => setChallenge(null)}
          >
            Request a new demo code
          </button>
        </form>
      )}
      {action.error && (
        <p className="error-notice" role="alert">
          {action.error}
        </p>
      )}
      {action.message && (
        <p role="status" className="subtle">
          {action.message}
        </p>
      )}
    </div>
  );
}
