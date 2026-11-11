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
    reviewer = await login("reviewer"),
    finance = await login("finance"),
    checker = await login("checker"),
    other = await login("facility2");
  results.push(
    "Five unique accounts authenticate through the live same-origin proxy",
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
  await other.api(
    "/claims/" + claimId,
    "GET",
    undefined,
    undefined,
    undefined,
    404,
  );
  claim = await facility.api(
    `/claims/${claimId}/submit`,
    "POST",
    {},
    claim.version,
  );
  await drain();
  claim = await reviewer.api("/claims/" + claimId);
  expect(claim.state).toBe("AWAITING_REVIEW");
  claim = await reviewer.api(
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
    "Scoped encounter, coverage, claim submission, durable validation, human insurer decision and cross-tenant denial",
  );
  let payment = await finance.api(
    `/claims/${claimId}/payment-authorizations`,
    "POST",
    {
      amountMinor: "2500",
      reason: "Synthetic hosted release verification only",
    },
    claim.version,
  );
  const paymentId = payment.id;
  await finance.api(
    `/payments/${paymentId}/approve`,
    "POST",
    {},
    payment.version,
    undefined,
    403,
  );
  payment = await checker.api(
    `/payments/${paymentId}/approve`,
    "POST",
    {},
    payment.version,
  );
  await finance.api(
    `/payments/${paymentId}/execute`,
    "POST",
    {},
    payment.version,
    undefined,
    400,
  );
  const challenge = await finance.api(
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
  payment = await finance.api(
    `/payments/${paymentId}/execute`,
    "POST",
    body,
    payment.version,
    command,
  );
  expect(payment.state).toBe("PROCESSING");
  const replay = await finance.api(
    `/payments/${paymentId}/execute`,
    "POST",
    body,
    challenge.paymentVersion,
    command,
  );
  expect(replay.id).toBe(paymentId);
  await drain();
  await finance.api(`/payments/${paymentId}/status-check`, "POST", {});
  const settled = (await finance.api("/payments")).find(
    (p: any) => p.id === paymentId,
  );
  expect(settled.state).toBe("SETTLED");
  expect(settled.mode).toBe("demo");
  results.push(
    "Maker/checker separation, mandatory demo-only confirmation, idempotent execution and simulated settlement",
  );
  const pdf = await finance.client.get("/api/v1/statements/pdf", {
    headers: { "X-Organization-ID": finance.org },
  });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await finance.api("/reports/statement");
  await finance.api("/reconciliation/exceptions");
  results.push(
    "Live scoped reports, reconciliation and portable PDF rendering",
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
