import { expect, test, type Page } from "@playwright/test";
import ar from "../messages/ar.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { session } from "./env";
import { watchConsole } from "./helpers";
import { ALL, ALLOWED, resolve } from "./routes";

// Opens every page in both languages as each role that may see it, and checks it draws its
// heading and finishes loading without errors. Roles outside an area get the "Not available" page.

const LOCALES = [
  { locale: "en", dir: "ltr", messages: en },
  { locale: "ar", dir: "rtl", messages: ar },
] as const;

const heading = (page: Page) => page.getByRole("heading", { level: 1 });

for (const role of ["admin", "it", "employee"] as const) {
  test.describe(`as ${role}`, () => {
    test.use({ storageState: session(role) });

    for (const route of ALLOWED[role]) {
      test(`${route} opens in both languages`, async ({ page }) => {
        const console = watchConsole(page);
        const path = await resolve(page, route);
        for (const { locale, dir, messages } of LOCALES) {
          await page.goto(`/${locale}${path === "/" ? "" : path}`);
          await expect(page.locator("html")).toHaveAttribute("dir", dir);
          await expect(heading(page)).toBeVisible();
          await expect(heading(page)).not.toHaveText(messages.errors.forbiddenTitle);
          await expect(heading(page)).not.toHaveText(messages.errors.notFoundTitle);
          await expect(heading(page)).not.toBeEmpty();
          // Nothing left loading: every skeleton has been replaced by the page's content.
          await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
          await page.waitForLoadState("networkidle");
        }
        console.assertClean();
      });
    }

    const denied = ALL.filter((r) => !ALLOWED[role].includes(r) && r !== "/");
    for (const route of denied) {
      test(`${route} is not available`, async ({ page }) => {
        const console = watchConsole(page);
        const path = route.replace(/:\w+/g, "1");
        for (const { locale, messages } of LOCALES) {
          await page.goto(`/${locale}${path}`);
          await expect(heading(page)).toHaveText(messages.errors.forbiddenTitle);
        }
        console.assertClean();
      });
    }
  });
}

test.describe("as employee", () => {
  test.use({ storageState: session("employee") });

  test("the dashboard address takes an employee to their requests", async ({ page }) => {
    await page.goto("/ar");
    await expect(page).toHaveURL(/\/ar\/requests$/);
    await expect(heading(page)).toHaveText(ar.requests.title);
  });
});

test.describe("as it", () => {
  test.use({ storageState: session("it") });

  test("an unknown address shows the not found page in both languages", async ({ page }) => {
    for (const { locale, messages } of LOCALES) {
      await page.goto(`/${locale}/no-such-page`);
      await expect(heading(page)).toHaveText(messages.errors.notFoundTitle);
    }
  });
});
