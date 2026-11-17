"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { authClient } from "../lib/auth-client";
import {
  illustrationSrc,
  illustrationSrcSet,
  siteImages,
  type SiteImageKey,
} from "../lib/site";

const mediaCopy: Record<
  string,
  { image: SiteImageKey; kicker: string; quote: string; points: string[] }
> = {
  login: {
    image: "team-at-work",
    kicker: "Organization access",
    quote:
      "One workspace for verified claims, clear decisions and traceable payments.",
    points: [
      "Insurer-controlled decisions",
      "Role-based access",
      "Auditable claim records",
    ],
  },
  invite: {
    image: "team-at-work",
    kicker: "Join LUX HealthPay",
    quote: "Bring your perspective to a clearer claims journey for Liberia.",
    points: [
      "Work across product and operations",
      "Build with real provider workflows",
      "Keep people at the centre",
    ],
  },
  forgot: {
    image: "family-phone",
    kicker: "Secure account access",
    quote: "Get back to the work that keeps claims moving.",
    points: [
      "Protected account recovery",
      "Role-based permissions",
      "Your data stays private",
    ],
  },
  reset: {
    image: "family-phone",
    kicker: "Secure account access",
    quote: "Choose a strong password and get back to your workspace.",
    points: [
      "Protected account recovery",
      "Role-based permissions",
      "Your data stays private",
    ],
  },
};

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

  const media = mediaCopy[action] ?? mediaCopy.login;
  const image = siteImages[media.image];
  const mid = image.widths[Math.min(1, image.widths.length - 1)];
  const heading = mfa
    ? "Verify it’s you."
    : action === "forgot"
      ? "Reset your access."
      : action === "reset"
        ? "Choose a new password."
        : action === "invite"
          ? "Accept your invitation."
          : "Welcome back.";
  const intro = mfa
    ? "Enter the six-digit code from your authenticator app to finish signing in."
    : action === "forgot"
      ? "Enter the email address on your approved organization account. We will send the reset link when the account is eligible."
      : action === "reset"
        ? "Set a new password with at least 11 characters, then sign in again."
        : action === "invite"
          ? "Confirm your name and choose a password to activate your LUX HealthPay account."
          : action === "login"
            ? "Sign in with your approved organization account. Your permissions determine what you can access."
            : "Complete the form below to continue.";

  return (
    <section className="lux-auth" aria-labelledby="auth-title">
      <div className="lux-auth-media">
        <picture>
          <source
            type="image/avif"
            srcSet={illustrationSrcSet(media.image, "avif")}
            sizes="(max-width: 900px) 100vw, 52vw"
          />
          <source
            type="image/webp"
            srcSet={illustrationSrcSet(media.image, "webp")}
            sizes="(max-width: 900px) 100vw, 52vw"
          />
          <img
            src={illustrationSrc(media.image, mid)}
            srcSet={illustrationSrcSet(media.image, "jpg")}
            sizes="(max-width: 900px) 100vw, 52vw"
            alt=""
            width={image.width}
            height={image.height}
            loading="eager"
            fetchPriority="high"
            style={{ objectPosition: image.position }}
          />
        </picture>
        <div className="lux-auth-media-shade" aria-hidden="true" />
        <div className="lux-auth-media-copy">
          <span className="lux-tag">LUX HEALTHPAY</span>
          <p className="lux-auth-quote">{media.quote}</p>
          <ul className="lux-auth-points">
            {media.points.map((point) => (
              <li key={point}>
                <Check size={16} /> {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="lux-auth-panel">
        <div className="lux-auth-card">
          <Link className="lux-auth-back" href="/">
            <ArrowLeft size={15} /> Back to the site
          </Link>
          <span className="lux-eyebrow">{media.kicker}</span>
          <h1 id="auth-title">{heading}</h1>
          <p className="lux-auth-intro">{intro}</p>
          {message ? (
            <div className="lux-auth-success" role="status">
              <h2>
                {action === "reset"
                  ? "Password changed."
                  : action === "invite"
                    ? "Invitation accepted."
                    : "Request received."}
              </h2>
              <p>{message}</p>
              <Link className="lux-btn small" href="/login">
                Return to login <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} method="post">
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
                          action === "login"
                            ? "current-password"
                            : "new-password"
                        }
                        required
                        minLength={11}
                      />
                      <small>At least 11 characters.</small>
                    </label>
                  )}
                </>
              )}
              {error && (
                <p className="error-notice" role="alert">
                  {error}
                </p>
              )}
              <button className="lux-btn" disabled={busy}>
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
                <Link className="lux-auth-link" href="/forgot-password">
                  Forgot your password?
                </Link>
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
            {action === "login" ? (
              <>
                New to LUX HealthPay?{" "}
                <Link href="/get-started">Request organization access</Link>.
              </>
            ) : (
              <>
                Already have access? <Link href="/login">Return to login</Link>.
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
