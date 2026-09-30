import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { session } from "./env";
import { resolvedTicket, signedOut } from "./helpers";
import { ALLOWED, resolve } from "./routes";

// axe finds no serious or critical problem on any page. English in the light theme and Arabic in
// the dark one between them cover both languages and both themes.

const MODES = [
  { locale: "en", colorScheme: "light" },
  { locale: "ar", colorScheme: "dark" },
] as const;

/** Opens the page in a mode and waits until it has finished loading. */
async function open(page: Page, path: string, { locale, colorScheme }: (typeof MODES)[number]) {
  await page.emulateMedia({ colorScheme });
  await page.goto(`/${locale}${path === "/" ? "" : path}`);
  const html = expect(page.locator("html"));
  await (colorScheme === "dark" ? html.toHaveClass(/\bdark\b/) : html.not.toHaveClass(/\bdark\b/));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

/** The serious and critical problems axe finds, each with the first few elements it affects. */
async function problems(page: Page, mode: (typeof MODES)[number]) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${mode.locale}/${mode.colorScheme} ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 5).map((n) => n.target.join(" ")).join("\n    ")}`);
}

test.describe("signed out", () => {
  test("the sign-in page has no serious accessibility problems", async ({ page }) => {
    const found: string[] = [];
    for (const mode of MODES) {
      await open(page, "/sign-in", mode);
      found.push(...(await problems(page, mode)));
    }
    expect(found, found.join("\n")).toEqual([]);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: session("admin") });

  for (const route of ALLOWED.admin) {
    test(`${route} has no serious accessibility problems`, async ({ page }) => {
      const path = await resolve(page, route);
      const found: string[] = [];
      for (const mode of MODES) {
        await open(page, path, mode);
        found.push(...(await problems(page, mode)));
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  }
});

test.describe("from a resolution email", () => {
  test.use({ storageState: session("admin") });

  test("the answer page has no serious accessibility problems", async ({ page, browser }, info) => {
    const { token } = await resolvedTicket(page, `Answer page check ${info.project.name}`);
    const visitor = await (await signedOut(browser)).newPage();
    const found: string[] = [];
    for (const mode of MODES) {
      await open(visitor, `/respond/${token}`, mode);
      found.push(...(await problems(visitor, mode)));
    }
    await visitor.context().close();
    expect(found, found.join("\n")).toEqual([]);
  });
});
