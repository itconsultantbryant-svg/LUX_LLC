import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const pages = [
  "/",
  "/services",
  "/how-it-works",
  "/about",
  "/partners",
  "/team",
  "/get-started",
  "/contact",
  "/privacy",
  "/terms",
  "/accessibility",
];
async function signIn(page: any, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60000 });
  await expect(page.getByText("DEMO ENVIRONMENT")).toBeVisible();
}
test("home hero uses page imagery and production proof points", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.getByRole("region", { name: /Verify the care/ });
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { level: 1 })).toContainText(
    "Verify the care. Verify the coverage.",
  );
  await expect(hero.getByText("Insurer-controlled decisions")).toBeVisible();
  await expect(
    hero.getByRole("link", { name: "Register with LUX" }),
  ).toHaveAttribute("href", "/get-started?type=PATIENT");
  await expect
    .poll(() =>
      page
        .locator(".lux-hero-media img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect(page.locator(".lux-hero-note, .lux-hero-credit")).toHaveCount(0);
  await expect(page.locator(".lux-figure figcaption")).toHaveCount(0);
  const credits = await page.request.get("/media/illustrations/credits.json");
  expect(credits.ok()).toBe(true);
  const manifest = await credits.json();
  expect(manifest.images).toHaveLength(3);
  for (const image of manifest.images)
    expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
});
test("every public page has an image-backed hero and consistent navigation", async ({
  page,
}) => {
  test.setTimeout(240000);
  const heroes: Array<[string, string]> = [
    ["/services", "team-at-work"],
    ["/how-it-works", "hero-doctor-patient"],
    ["/about", "team-at-work"],
    ["/partners", "team-at-work"],
    ["/team", "team-at-work"],
    ["/get-started", "hero-doctor-patient"],
    ["/contact", "family-phone"],
    ["/privacy", "family-phone"],
    ["/terms", "team-at-work"],
    ["/accessibility", "hero-doctor-patient"],
  ];
  for (const [route, image] of heroes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const hero = page.locator(".lux-page-hero");
    await expect(hero, route).toBeVisible();
    await expect(hero.locator("h1"), route).toBeVisible();
    await expect(hero.locator("img"), route).toHaveAttribute(
      "src",
      new RegExp(`${image}-`),
    );
    await expect
      .poll(
        () =>
          hero
            .locator("img")
            .evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
        { message: route },
      )
      .toBe(true);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  }
});
test("public copy is production-facing without disclaimer footnotes", async ({
  page,
}) => {
  test.setTimeout(240000);
  for (const route of pages) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const body = await page.locator("main").innerText();
    expect(body, route).not.toMatch(
      /synthetic|illustrative|AI-generated|operator-review|no live payment|not enabled|no email has been sent/i,
    );
    await expect(
      page.locator(".lux-note, .lux-status, .lux-notice"),
    ).toHaveCount(0);
  }
  await page.goto("/");
  const journey = page.getByRole("region", { name: "Covered in seven steps" });
  await expect(journey).toBeVisible();
  await expect(journey.locator("li")).toHaveCount(7);
  await expect(journey).toContainText("LUX never holds your money");
  await expect(page.locator(".lux-demo-badge")).toHaveText("CLAIMS WORKSPACE");
  await expect(
    page.getByRole("heading", { name: "Powered by Orange Money" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Approved funds move through Orange Money/),
  ).toBeVisible();
});
test("team profile opens with keyboard, traps focus and returns it on Escape", async ({
  page,
}) => {
  await page.goto("/team");
  const opener = page.getByRole("button", {
    name: "View profile: Maryann Duncan",
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Maryann Duncan" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close team profile" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});
test("all public destinations work without authentication", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const route of pages) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  }
});
test("team text and supplied portraits, no fabricated biography", async ({
  page,
}) => {
  await page.goto("/team");
  for (const name of [
    "Maryann Duncan",
    "Boakai K. C Hina",
    "Jedidiah Kromah",
    "Sade Odiaja",
    "Samson Bryant",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  const maryann = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Maryann Duncan" }) });
  await expect(maryann.locator(".team-role")).toHaveText(
    "Team Lead and Arbiter",
  );
  await expect(maryann.locator(".team-copy>p")).toHaveCount(1);
  await expect(page.getByText("Biography pending approval")).toHaveCount(0);
});
test("mobile menu supports focus and Escape; pages do not overflow", async ({
  page,
}) => {
  test.setTimeout(300000);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/services",
      "/team",
      "/get-started",
      "/contact",
      "/privacy",
      "/login",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open navigation" });
  await toggle.click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "For patients", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
});
test("patient registration enquiry validates and records without email-success fiction", async ({
  page,
}) => {
  await page.goto("/get-started");
  await expect(
    page.getByRole("heading", { name: "Start with a few details." }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Patient / family" }),
  ).toBeChecked();
  await page
    .getByLabel("Community, employer or organization")
    .fill("Individual");
  await page.getByLabel("Your name").fill("Synthetic Patient");
  await page.getByLabel("Email", { exact: true }).fill("browser@example.test");
  await page.getByLabel("Mobile number").fill("0770000000");
  await page.getByLabel("City or county").fill("Monrovia");
  await page
    .getByLabel("How can we help?")
    .fill("Synthetic patient cover enquiry; no medical details.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Enquiry recorded." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Our team will review it and contact you",
  );
});
test("facility enquiry uses organization fields and creates an organization request", async ({
  page,
}) => {
  await page.goto("/get-started?type=FACILITY");
  await expect(
    page.getByRole("radio", { name: "Health facility" }),
  ).toBeChecked();
  await page.getByLabel("Organization name").fill("Synthetic browser clinic");
  await page.getByLabel("Contact name").fill("Synthetic Contact");
  await page.getByLabel("Work email").fill("facility@example.test");
  await page.getByLabel("Telephone").fill("0770000001");
  await page.getByLabel("Location", { exact: true }).fill("Monrovia");
  await page
    .getByLabel("How can we help?")
    .fill("Synthetic organization pilot request; no patient details.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Enquiry recorded." }),
  ).toBeVisible();
});
test("login and account recovery use the split image layout", async ({
  page,
}) => {
  test.setTimeout(120000);
  const screens: Array<[string, string]> = [
    ["/login", "Welcome back."],
    ["/forgot-password", "Reset your access."],
    ["/reset-password", "Choose a new password."],
    ["/accept-invitation", "Accept your invitation."],
  ];
  for (const [route, heading] of screens) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".lux-auth"), route).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
      route,
    ).toBeVisible();
    await expect(page.locator(".lux-auth-card"), route).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator(".lux-auth-media img")
            .evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
        { message: route },
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      route,
    ).toBe(true);
  }
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log In", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Forgot your password?" }),
  ).toHaveAttribute("href", "/forgot-password");
});
test("public accessibility automated checks", async ({ page }) => {
  test.setTimeout(240000);
  for (const route of [
    "/",
    "/get-started",
    "/team",
    "/contact",
    "/privacy",
    "/login",
  ]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations, route).toEqual([]);
  }
});
test("facility signs in, sees scoped data and creates a submitted claim", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await page.goto("/login");
  await page.getByLabel("Email address").fill("facility@demo.lux.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 60000 });
  await expect(page.getByText("DEMO ENVIRONMENT")).toBeVisible();
  await page
    .getByRole("link", { name: /Prepare a claim/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Start a fresh draft" }).click();
  await page.getByLabel("Authorized patient").selectOption({ index: 1 });
  await page.getByLabel("Contracted insurer").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Check insurer coverage" }).click();
  await page
    .getByLabel("Diagnosis / encounter description")
    .fill("Synthetic browser encounter");
  await page
    .getByLabel("Clinical notes")
    .fill("Synthetic notes for a working browser journey.");
  await page.getByRole("button", { name: "Save encounter & continue" }).click();
  await page
    .getByRole("button", { name: "Save draft & review evidence" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Draft saved/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open full summary & submit" }).click();
  await page.getByRole("button", { name: "Submit claim", exact: true }).click();
  await expect(page.locator(".app-title .badge")).toContainText(
    /submitted|awaiting review|validating/,
  );
});
test("insurer signs in with every insurer role and sees the review and payment workspace", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await signIn(page, "insurer@demo.lux.test");
  await expect(
    page.getByRole("heading", { name: "Insurance desk overview." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Platform overview, Insurance." }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Awaiting review", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("Where payments stand")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const item of [
    "Claims queue",
    "Flagged claims",
    "Decisions & appeals",
    "Coverage & tariffs",
    "Payments & authorizations",
    "Reconciliation",
    "Reports & statements",
    "Organization users",
    "Audit history",
  ])
    await expect(
      nav.getByRole("link", { name: new RegExp(item) }),
    ).toBeVisible();
  await expect(
    page.locator(".org-roles").getByText("insurer admin"),
  ).toBeVisible();
  await expect(
    page.locator(".org-roles").getByText("insurer finance"),
  ).toBeVisible();
  await page.getByRole("link", { name: /Payments & authorizations/ }).click();
  await expect(
    page.getByRole("heading", { name: "Payments & authorizations" }),
  ).toBeVisible();
});
test("LUX admin sees a comprehensive platform command centre and network tools", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await signIn(page, "admin@demo.lux.test");
  await expect(
    page.getByRole("heading", { name: "Platform overview, LUX." }),
  ).toBeVisible();
  await expect(page.getByText("LUX command centre")).toBeVisible();
  await expect(page.getByText("Claims across the platform")).toBeVisible();
  await expect(page.getByText("Fee assessment")).toBeVisible();
  await expect(page.getByText("Operational health")).toBeVisible();
  await expect(page.getByText("Active memberships by role")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const item of [
    "Organizations",
    "Organization requests",
    "Public enquiries",
    "Fee revenue",
    "Reports & statements",
    "Integration health",
    "Validation operations",
    "Public content",
    "Team profiles",
    "Audit history",
  ])
    await expect(
      nav.getByRole("link", { name: new RegExp(item) }),
    ).toBeVisible();
  await expect(
    page.locator(".org-roles").getByText("platform admin"),
  ).toBeVisible();
  await expect(
    page.locator(".org-roles").getByText("lux finance"),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Organizations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Organizations", exact: true }),
  ).toBeVisible();
});
test("facility navigation groups all four facility roles and their destinations", async ({
  page,
}) => {
  test.setTimeout(180000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await signIn(page, "facility@demo.lux.test");
  await expect(
    page.getByRole("heading", { name: "Facility overview." }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const item of [
    "Patients & eligibility",
    "Encounters",
    "Claims",
    "Returned claims",
    "Wallet destination",
    "Payments & authorizations",
    "Reconciliation",
    "Reports & statements",
    "Contracted organizations",
    "Organization users",
  ])
    await expect(
      nav.getByRole("link", { name: new RegExp(item) }),
    ).toBeVisible();
  for (const role of [
    "facility claims",
    "facility admin",
    "facility finance",
    "facility clinician",
  ])
    await expect(page.locator(".org-roles").getByText(role)).toBeVisible();
  await expect(page.getByText("Claim volume")).toBeVisible();
  await expect(page.getByText("Your work queue")).toBeVisible();
});
test("key workspace screens fit supported widths and expose accessible controls", async ({
  page,
}) => {
  test.setTimeout(300000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await signIn(page, "facility@demo.lux.test");
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/app",
      "/app/claims",
      "/app/payments",
      "/app/reconciliation",
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
  await page.goto("/app/claims");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});
