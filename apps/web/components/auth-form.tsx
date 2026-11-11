"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
export function AuthForm({ action = "login" }: { action?: string }) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mfa, setMfa] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    setBusy(true);
    setError("");
    try {
      if (action === "invite") {
        const res = await fetch("/api/v1/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: new URLSearchParams(location.search).get("token"),
            ...data,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw Error(body.message);
        setMessage(body.message);
      } else if (action === "reset") {
        const token = new URLSearchParams(location.search).get("token");
        const result = await authClient.resetPassword({
          newPassword: data.password,
          token: token || "",
        });
        if (result.error)
          throw Error(
            "Unable to reset your password. The link may have expired.",
          );
        setMessage("Password changed. You can sign in.");
      } else if (action === "forgot") {
        await authClient.requestPasswordReset({
          email: data.email,
          redirectTo: location.origin + "/reset-password",
        });
        setMessage(
          "If the account is eligible and email delivery is configured, reset instructions will be sent.",
        );
      } else if (mfa) {
        const result = await authClient.twoFactor.verifyTotp({
          code: data.code,
        });
        if (result.error) throw Error("Unable to verify this code.");
        location.assign("/app");
      } else {
        const result = await authClient.signIn.email({
          email: data.email,
          password: data.password,
        });
        if (result.error)
          throw Error(
            "Unable to sign in. Check your credentials and account access.",
          );
        if ((result.data as any)?.twoFactorRedirect) setMfa(true);
        else location.assign("/app");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection unavailable. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <span className="eyebrow">LUX HealthPay · Organization access</span>
      <h1>
        {mfa
          ? "Verify it’s you."
          : action === "forgot"
            ? "Reset your access."
            : action === "reset"
              ? "A new password."
              : action === "invite"
                ? "Your invitation."
                : "Welcome back."}
      </h1>
      <p>
        {action === "login"
          ? "Sign in with your approved organization account. Your permissions—not a public role selector—determine access."
          : "Use only your own account information. Never enter an Orange Money PIN."}
      </p>
      {message ? (
        <div className="success-panel" role="status">
          <p>{message}</p>
          <a href="/login">Return to login</a>
        </div>
      ) : (
        <form onSubmit={submit}>
          {mfa ? (
            <label>
              Authenticator code
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
              />
            </label>
          ) : (
            <>
              {action === "invite" && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                  />
                </label>
              )}
              {["login", "forgot"].includes(action) && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {action !== "forgot" && (
                <label>
                  Password
                  <input
                    name="password"
                    aria-label="Password"
                    type="password"
                    autoComplete={
                      action === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={12}
                  />
                  <small>At least 12 characters.</small>
                </label>
              )}
            </>
          )}
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy
              ? "Please wait…"
              : mfa
                ? "Verify code"
                : action === "forgot"
                  ? "Request reset"
                  : action === "invite"
                    ? "Accept invitation"
                    : action === "reset"
                      ? "Change password"
                      : "Log In"}
          </button>
          {action === "login" && (
            <a href="/forgot-password">Forgot your password?</a>
          )}
        </form>
      )}
      <p className="auth-note">
        {action === "invite" && (
          <>
            <button
              className="inline-button"
              onClick={async () => {
                setError("");
                try {
                  const res = await fetch(
                    "/api/v1/invitations/accept-existing",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        token: new URLSearchParams(location.search).get(
                          "token",
                        ),
                      }),
                    },
                  );
                  const data = await res.json();
                  if (!res.ok) throw Error(data.message);
                  setMessage(data.message);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Sign in to your existing account first.",
                  );
                }
              }}
            >
              Accept for my already signed-in account
            </button>
            <br />
          </>
        )}
        New to LUX HealthPay?{" "}
        <a href="/get-started">Send an organization enquiry</a>. Access is
        approval-based.
      </p>
    </div>
  );
}
