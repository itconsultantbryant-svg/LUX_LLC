import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { pool } from "../../../packages/db/index.ts";
export const mode = process.env.LUX_MODE || "unconfigured";
if (!["demo", "manual", "sandbox", "live", "unconfigured"].includes(mode))
  throw Error("Invalid LUX_MODE");
const explicitlyHostedDemo =
  process.env.NODE_ENV === "production" &&
  mode === "demo" &&
  process.env.DEPLOYMENT_TIER === "demo";
if (
  process.env.NODE_ENV === "production" &&
  mode === "demo" &&
  !explicitlyHostedDemo
)
  throw Error("Production may not use demo adapters");
if (explicitlyHostedDemo) {
  if (
    !process.env.WEB_ORIGIN?.startsWith("https://") ||
    !process.env.BETTER_AUTH_URL?.startsWith("https://")
  )
    throw Error("Hosted demos require explicit HTTPS origins");
  const data = await pool.query(
    "SELECT count(*)::int n FROM organizations WHERE demo=false",
  );
  if (data.rows[0].n)
    throw Error("A hosted demo may contain synthetic organizations only");
}
if (
  !process.env.BETTER_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET.length < 32
)
  throw Error("Set a high-entropy BETTER_AUTH_SECRET (32+ characters)");
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.MAIL_API_KEY || !process.env.MAIL_FROM)
    throw Error("MAIL_NOT_CONFIGURED");
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject,
      text,
    }),
  });
  if (!result.ok) throw Error("MAIL_DELIVERY_FAILED");
}
export const auth = betterAuth({
  appName: "LUX HealthPay",
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [process.env.WEB_ORIGIN || "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail(
        user.email,
        "Reset your LUX HealthPay password",
        `Use this single-use link: ${url}`,
      );
    },
  },
  emailVerification: {
    sendVerificationEmail: process.env.MAIL_API_KEY
      ? async ({ user, url }) => {
          await sendMail(
            user.email,
            "Verify your LUX HealthPay email",
            `Verify your address: ${url}`,
          );
        }
      : undefined,
  },
  session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30, freshAge: 60 * 10 },
  plugins: [twoFactor({ issuer: "LUX HealthPay" })],
  rateLimit: { enabled: true, storage: "database" },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const r = await pool.query(
            'SELECT suspended FROM "user" WHERE id=$1',
            [session.userId],
          );
          if (r.rows[0]?.suspended) return false;
          return { data: session };
        },
        after: async (session) => {
          await pool.query(
            "INSERT INTO audit_events(actor_id,action) VALUES($1,$2)",
            [session.userId, "LoginSessionCreated"],
          );
        },
      },
    },
  },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
});
