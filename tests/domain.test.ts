import { describe, it, expect } from "vitest";
import {
  fees,
  transitionClaim,
  transitionPayment,
  billTotal,
  parseAI,
  csvCell,
  permissions,
  canSeeClaim,
  enquirySchema,
} from "../packages/domain/index.ts";
import { teamContactsSchema } from "../packages/domain/team-contacts.ts";
describe("exact fee accounting", () => {
  it("insurer-added $1,000 yields $20, $10/$10; base principal unchanged", () => {
    expect(fees(100000n, "INSURER_ADDED")).toEqual({
      base: "100000",
      total: "2000",
      lux: "1000",
      orange: "1000",
      insurerDebit: "102000",
      facilityNet: "100000",
      mode: "INSURER_ADDED",
    });
  });
  it("facility-deducted preserves insurer debit and nets $980", () => {
    const f = fees(100000n, "FACILITY_DEDUCTED");
    expect(f.insurerDebit).toBe("100000");
    expect(f.facilityNet).toBe("98000");
    expect(f.lux).toBe("1000");
    expect(f.orange).toBe("1000");
  });
  it("blocks unconfigured policy and nonpositive amounts", () => {
    expect(() => fees(1n, "UNCONFIGURED")).toThrow("FEE POLICY");
    expect(() => fees(0n, "INSURER_ADDED")).toThrow();
  });
  it("rounds once, assigns odd residual to Orange, imposes no minimum", () => {
    expect(fees(1n, "INSURER_ADDED").total).toBe("0");
    expect(fees(25n, "INSURER_ADDED")).toMatchObject({
      total: "1",
      lux: "0",
      orange: "1",
    });
    for (let n = 1n; n < 10000n; n += 17n) {
      const f = fees(n, "FACILITY_DEDUCTED");
      expect(BigInt(f.lux) + BigInt(f.orange)).toBe(BigInt(f.total));
      expect(BigInt(f.facilityNet) + BigInt(f.total)).toBe(n);
    }
  });
  it("computes item totals without floating point", () => {
    expect(
      billTotal([
        {
          code: "PILOT-A",
          description: "Synthetic",
          quantity: 3,
          unitMinor: "333",
        },
      ]),
    ).toBe(999n);
  });
});
describe("authority and monotonic state rules", () => {
  it("validation never directly approves or rejects", () => {
    expect(() => transitionClaim("VALIDATING", "APPROVED")).toThrow();
    expect(() => transitionClaim("VALIDATING", "REJECTED")).toThrow();
    expect(transitionClaim("VALIDATING", "AWAITING_REVIEW")).toBe(
      "AWAITING_REVIEW",
    );
  });
  it("a settled payment cannot regress on a delayed callback", () => {
    expect(() => transitionPayment("SETTLED", "PROCESSING")).toThrow();
    expect(transitionPayment("SETTLED", "REVERSED")).toBe("REVERSED");
  });
  it("an unknown timeout cannot initiate another execution", () => {
    expect(() =>
      transitionPayment("UNKNOWN_PENDING_INVESTIGATION", "PROCESSING"),
    ).toThrow();
    expect(transitionPayment("UNKNOWN_PENDING_INVESTIGATION", "SETTLED")).toBe(
      "SETTLED",
    );
  });
  it("platform administration is not clinical or insurer financial authority", () => {
    expect(permissions(["PLATFORM_ADMIN"])).not.toContain("clinical");
    expect(permissions(["PLATFORM_ADMIN"])).not.toContain("review");
    expect(permissions(["FACILITY_CLAIMS"])).not.toContain("encounters.write");
    expect(permissions(["FACILITY_CLINICIAN"])).toContain("encounters.write");
    expect(permissions(["FACILITY_CLAIMS"])).not.toContain(
      "payments.authorize",
    );
  });
  it("allows only the two contracted claim organizations", () => {
    expect(canSeeClaim("a", { facility_id: "a", insurer_id: "b" })).toBe(true);
    expect(canSeeClaim("c", { facility_id: "a", insurer_id: "b" })).toBe(false);
  });
});
describe("untrusted inputs", () => {
  it("only accepts approved contact shapes and safe link protocols", () => {
    expect(
      teamContactsSchema.safeParse([
        { kind: "linkedin", value: "javascript:alert(1)" },
      ]).success,
    ).toBe(false);
    expect(
      teamContactsSchema.safeParse([{ kind: "email", value: "not an email" }])
        .success,
    ).toBe(false);
    expect(
      teamContactsSchema.safeParse([
        {
          kind: "linkedin",
          value: "https://www.linkedin.com/in/synthetic-example",
        },
      ]).success,
    ).toBe(true);
  });
  it("rejects fabricated actions and invalid AI outputs", () => {
    expect(() => parseAI({ findings: [], initiatePayment: true })).toThrow();
    expect(() => parseAI({ findings: [{ confidence: 10 }] })).toThrow();
    expect(parseAI({ findings: [] })).toEqual({ findings: [] });
  });
  it("neutralizes formulas including leading whitespace", () => {
    for (const v of ['=HYPERLINK("x")', "+1", "-2", "@SUM(A1)", "  =1"])
      expect(csvCell(v)).toMatch(/^"'/);
    expect(csvCell("normal")).toBe('"normal"');
  });
  it("requires consent and rejects honeypot spam", () => {
    const d = {
      kind: "FACILITY",
      organization: "Synthetic clinic",
      name: "Synthetic contact",
      email: "synthetic@example.test",
      phone: "0770000000",
      location: "Monrovia",
      message: "Synthetic pilot enquiry",
      consent: true,
    };
    expect(enquirySchema.safeParse(d).success).toBe(true);
    expect(enquirySchema.safeParse({ ...d, consent: false }).success).toBe(
      false,
    );
    expect(enquirySchema.safeParse({ ...d, website: "spam" }).success).toBe(
      false,
    );
  });
});
