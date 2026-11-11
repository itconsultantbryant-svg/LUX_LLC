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
test("real-photo carousel has credits, working images and manual controls", async ({
  page,
}) => {
  await page.goto("/");
  const carousel = page.getByRole("region", {
    name: "LUX HealthPay healthcare journey",
  });
  await expect(carousel).toBeVisible();
  await expect(carousel.locator(".hero-image-disclosure")).toContainText(
    "Liberia",
  );
  await expect(carousel.locator(".hero-image-disclosure a")).toHaveCount(2);
  await carousel
    .getByRole("button", { name: "Next slide", exact: true })
    .click();
  await expect(carousel.locator("h1")).toContainText("From the first record");
  await expect(carousel.locator(".hero-image-disclosure")).toContainText(
    "Harper City",
  );
  await carousel
    .getByRole("button", {
      name: "Show slide 4: Orange Money · Intended payment channel",
    })
    .click();
  await expect(carousel.locator(".hero-photo-layer.is-active img")).toHaveCSS(
    "object-position",
    "50% 10%",
  );
  await expect(carousel.locator(".hero-image-disclosure")).toContainText(
    "Monrovia",
  );
  await expect(page.locator('img[alt*="AI-generated"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".hero-photo-layer.is-active img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const credits = await page.request.get("/media/scenes/credits.json");
  expect(credits.ok()).toBe(true);
  expect(await credits.json()).toHaveLength(6);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(
    carousel.getByRole("button", { name: "Start slide rotation" }),
  ).toBeDisabled();
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
  for (const route of pages) {
    const response = await page.goto(route);
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
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/services", "/team", "/get-started"]) {
      await page.goto(route);
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
      .getByRole("link", { name: "Home", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
});
test("enquiry validates and records without email-success fiction", async ({
  page,
}) => {
  await page.goto("/get-started");
  await page.getByLabel("Organization name").fill("Synthetic browser clinic");
  await page.getByLabel("Contact name").fill("Synthetic Contact");
  await page.getByLabel("Work email").fill("browser@example.test");
  await page.getByLabel("Telephone").fill("0770000000");
  await page.getByLabel("Location", { exact: true }).fill("Monrovia");
  await page
    .getByLabel("How can we help?")
    .fill("Synthetic organization pilot request; no patient details.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Enquiry recorded." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "No email has been sent",
  );
});
test("public accessibility automated checks", async ({ page }) => {
  for (const route of ["/", "/get-started", "/team"]) {
    await page.goto(route);
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
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("DEMO ENVIRONMENT")).toBeVisible();
  await page.getByRole("link", { name: "+ Prepare a claim" }).click();
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
test("key workspace screens fit supported widths and expose accessible controls", async ({
  page,
}) => {
  test.setTimeout(300000);
  test.skip(!process.env.DEMO_PASSWORD, "Local seed password is required");
  await page.goto("/login");
  await page.getByLabel("Email address").fill("facility@demo.lux.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
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
