import { request, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const baseURL = process.env.SMOKE_BASE_URL;
if (
  !baseURL?.startsWith("https://") ||
  process.env.ALLOW_SYNTHETIC_SMOKE !== "true"
)
  throw Error(
    "Explicit HTTPS demo URL and ALLOW_SYNTHETIC_SMOKE=true required",
  );
const passwords = JSON.parse(
  await readFile(process.env.DEMO_PASSWORDS_FILE!, "utf8"),
);
const results: string[] = [];
const contexts: any[] = [];
async function login(key: string) {
  const client = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL! },
    timeout: 60000,
  });
  contexts.push(client);
  const response = await client.post("/api/auth/sign-in/email", {
    data: { email: `${key}@demo.lux.test`, password: passwords[key] },
  });
  expect(response.status(), `${key} sign in`).toBe(200);
  const me = await (await client.get("/api/v1/me")).json();
  expect(me.mode).toBe("demo");
  expect(me.memberships).toHaveLength(1);
  const org = me.memberships[0].id;
  return {
    client,
    org,
    async api(
      path: string,
      method = "GET",
      data?: unknown,
      version?: number,
      key?: string,
      expected = 200,
    ) {
      const r = await client.fetch("/api/v1" + path, {
        method,
        data,
        headers: {
          "X-Organization-ID": org,
          ...(version === undefined ? {} : { "If-Match": String(version) }),
          ...(method === "GET"
            ? {}
            : { "Idempotency-Key": key || randomUUID() }),
        },
      });
      expect(r.status(), `${method} ${path}: ${r.status()}`).toBe(expected);
      return r.json();
    },
  };
}
async function drain() {
  if (!process.env.WORKER_URL || !process.env.WORKER_TRIGGER_SECRET)
    throw Error("Worker URL and secret required");
  const response = await fetch(process.env.WORKER_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.WORKER_TRIGGER_SECRET },
  });
  expect(response.status).toBe(200);
}
try {
  const anonymous = await request.newContext({ baseURL });
  contexts.push(anonymous);
  expect((await anonymous.get("/api/v1/health")).status()).toBe(200);
  expect((await anonymous.get("/api/v1/claims")).status()).toBe(401);
  expect(
    (await anonymous.post("/api/auth/sign-up/email", { data: {} })).status(),
  ).toBe(403);
  results.push("Health and unauthenticated/signup denials");
  const facility = await login("facility"),
    insurer = await login("insurer"),
    admin = await login("admin");
  results.push(
    "Three demo accounts authenticate through the live same-origin proxy; tenant isolation is covered by the PostgreSQL suite",
  );
  const patients = await facility.api("/patients"),
    contracts = await facility.api("/contracts");
  const patientId = patients[0].id,
    insurerId = contracts[0].id;
  const coverage = await facility.api("/eligibility-checks", "POST", {
    patientId,
    insurerId,
  });
  const encounter = await facility.api("/encounters", "POST", {
    patientId,
    serviceDate: new Date().toISOString().slice(0, 10),
    diagnosis: "SYNTHETIC HOSTED RELEASE CHECK",
    notes: "Synthetic test only; no real patient information.",
    prescription: [],
  });
  let claim = await facility.api("/claims", "POST", {
    patientId,
    insurerId,
    encounterId: encounter.id,
    eligibilityId: coverage.id,
    currency: "USD",
    items: [
      {
        code: "PILOT-CONSULT",
        description: "Synthetic hosted smoke consultation",
        quantity: 1,
        unitMinor: "2500",
      },
    ],
  });
  const claimId = claim.id;
  claim = await facility.api(
    `/claims/${claimId}/submit`,
    "POST",
    {},
    claim.version,
  );
  await drain();
  claim = await insurer.api("/claims/" + claimId);
  expect(claim.state).toBe("AWAITING_REVIEW");
  claim = await insurer.api(
    `/claims/${claimId}/decisions`,
    "POST",
    {
      outcome: "APPROVED",
      approvedMinor: "2500",
      reason:
        "Human synthetic release verification; not an actual medical or insurance decision.",
    },
    claim.version,
  );
  results.push(
    "Scoped encounter, coverage, claim submission, durable validation and human insurer decision",
  );
  let payment = await insurer.api(
    `/claims/${claimId}/payment-authorizations`,
    "POST",
    {
      amountMinor: "2500",
      reason: "Synthetic hosted release verification only",
    },
    claim.version,
  );
  const paymentId = payment.id;
  await insurer.api(
    `/payments/${paymentId}/approve`,
    "POST",
    {},
    payment.version,
    undefined,
    403,
  );
  payment = await insurer.api(
    `/payments/${paymentId}/approve`,
    "POST",
    { demoSelfCheck: true },
    payment.version,
  );
  expect(payment.demo_self_check).toBe(true);
  await insurer.api(
    `/payments/${paymentId}/execute`,
    "POST",
    {},
    payment.version,
    undefined,
    400,
  );
  const challenge = await insurer.api(
    `/payments/${paymentId}/demo-confirmation`,
    "POST",
    {},
  );
  expect(challenge.warning).toContain("never your real Orange Money PIN");
  const body = {
      challengeId: challenge.challengeId,
      demoCode: challenge.demoCode,
    },
    command = randomUUID();
  payment = await insurer.api(
    `/payments/${paymentId}/execute`,
    "POST",
    body,
    payment.version,
    command,
  );
  expect(payment.state).toBe("PROCESSING");
  const replay = await insurer.api(
    `/payments/${paymentId}/execute`,
    "POST",
    body,
    challenge.paymentVersion,
    command,
  );
  expect(replay.id).toBe(paymentId);
  await drain();
  await insurer.api(`/payments/${paymentId}/status-check`, "POST", {});
  const settled = (await insurer.api("/payments")).find(
    (p: any) => p.id === paymentId,
  );
  expect(settled.state).toBe("SETTLED");
  expect(settled.mode).toBe("demo");
  results.push(
    "Explicit demo checker substitution, mandatory demo-only confirmation, idempotent execution and simulated settlement",
  );
  const payroll = await insurer.api("/payroll");
  expect(payroll.simulated).toBe(true);
  expect(payroll.packages.length).toBeGreaterThan(0);
  expect(payroll.bands.length).toBeGreaterThan(0);
  expect(payroll.subscriptions.length).toBeGreaterThan(0);
  expect(payroll.totals.length).toBeGreaterThan(0);
  const facilityPayroll = await facility.api("/payroll");
  expect(facilityPayroll.scope).toBe("FACILITY");
  const walletBefore = await facility.api("/finance/wallet");
  const facilityBefore = walletBefore.wallets.find(
    (w: any) => w.organization_id === facility.org && w.currency === "USD",
  );
  expect(facilityBefore).toBeTruthy();

  const coverage2 = await facility.api("/eligibility-checks", "POST", {
    patientId,
    insurerId,
  });
  const encounter2 = await facility.api("/encounters", "POST", {
    patientId,
    serviceDate: new Date().toISOString().slice(0, 10),
    diagnosis: "SYNTHETIC HOSTED INSTANT PAYMENT CHECK",
    notes: "Synthetic instant settlement test only; no real patient information.",
    prescription: [],
  });
  let instantClaim = await facility.api("/claims", "POST", {
    patientId,
    insurerId,
    encounterId: encounter2.id,
    eligibilityId: coverage2.id,
    currency: "USD",
    items: [
      {
        code: "PILOT-CONSULT",
        description: "Synthetic hosted instant settlement consultation",
        quantity: 1,
        unitMinor: "4400",
      },
    ],
  });
  instantClaim = await facility.api(
    `/claims/${instantClaim.id}/submit`,
    "POST",
    {},
    instantClaim.version,
  );
  await drain();
  instantClaim = await insurer.api("/claims/" + instantClaim.id);
  instantClaim = await insurer.api(
    `/claims/${instantClaim.id}/decisions`,
    "POST",
    {
      outcome: "APPROVED",
      approvedMinor: "4400",
      reason:
        "Human synthetic instant-settlement verification; not an actual medical or insurance decision.",
    },
    instantClaim.version,
  );
  const prepared = await insurer.api(
    `/claims/${instantClaim.id}/instant-payment`,
    "POST",
    {
      amountMinor: "4400",
      reason: "Synthetic hosted instant settlement verification only",
    },
  );
  expect(prepared.demoCode).toMatch(/^\d{4}$/);
  expect(prepared.warning).toContain("SIMULATION ONLY");
  expect(prepared.payment.state).toBe("AUTHORIZED");
  const confirmed = await insurer.api(
    `/payments/${prepared.payment.id}/instant-payment`,
    "POST",
    {
      challengeId: prepared.challengeId,
      demoCode: prepared.demoCode,
    },
    prepared.payment.version,
  );
  expect(confirmed.settledNow).toBe(true);
  expect(confirmed.payment.state).toBe("SETTLED");
  const transfer = confirmed.wallet;
  expect(BigInt(transfer.insurer_debit_minor)).toBe(
    BigInt(transfer.facility_credit_minor) +
      BigInt(transfer.lux_minor) +
      BigInt(transfer.orange_minor),
  );
  expect(BigInt(transfer.lux_minor) + BigInt(transfer.orange_minor)).toBe(
    BigInt(transfer.fee_total_minor),
  );
  expect(BigInt(transfer.lux_minor)).toBe(BigInt(transfer.orange_minor));
  const walletAfter = await facility.api("/finance/wallet");
  const facilityAfter = walletAfter.wallets.find(
    (w: any) => w.organization_id === facility.org && w.currency === "USD",
  );
  expect(
    BigInt(facilityAfter.balance_minor) - BigInt(facilityBefore.balance_minor),
  ).toBe(BigInt(transfer.facility_credit_minor));
  const insurerWallet = await insurer.api("/finance/wallet");
  const totals = insurerWallet.totals.find((t: any) => t.currency === "USD");
  expect(totals).toBeTruthy();
  expect(BigInt(totals.luxMinor)).toBeGreaterThan(0);
  expect(BigInt(totals.orangeMinor)).toBeGreaterThan(0);
  expect(insurerWallet.fundings.length).toBeGreaterThan(0);
  results.push(
    "Live payroll cover, instant four-digit demo settlement, facility wallet credit and LUX/Orange fee split",
  );
  const pdf = await insurer.client.get("/api/v1/statements/pdf", {
    headers: { "X-Organization-ID": insurer.org },
  });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await insurer.api("/reports/statement");
  await insurer.api("/reconciliation/exceptions");
  const metrics = await admin.api("/admin/metrics");
  expect(metrics.totals.claims).toBeGreaterThan(0);
  const nav = await admin.api("/nav");
  expect(nav.badges).toHaveProperty("organization-requests");
  results.push(
    "Live scoped reports, reconciliation, portable PDF rendering and the platform command-centre metrics",
  );
  const worker = await fetch(process.env.WORKER_URL!, { method: "POST" });
  expect(worker.status).toBe(401);
  results.push("Public worker rejects unauthenticated execution");
  const report = {
    at: new Date().toISOString(),
    baseURL,
    claimId,
    paymentId,
    results,
    classification:
      "Synthetic-only hosted smoke; no real funds or patient information",
  };
  await writeFile(
    ".local/hosted-smoke-results.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(contexts.map((c) => c.dispose()));
}
