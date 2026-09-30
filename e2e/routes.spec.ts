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

/** What the pages read from the API, by the area of the app allowed to read it. */
const APIS = {
  request: ["/api/me", "/api/tickets", "/api/kb", "/api/lookups"],
  it: [
    "/api/dashboard",
    "/api/kpis",
    "/api/changes",
    "/api/assets",
    "/api/discovery",
    "/api/relationships",
    "/api/licenses",
    "/api/network",
    "/api/alerts",
    "/api/daily-checks",
    "/api/projects",
    "/api/budgets",
    "/api/purchases",
    "/api/contracts",
    "/api/vendors",
    "/api/risks",
    "/api/vulnerabilities",
    "/api/employees",
    "/api/joiners",
    "/api/leavers",
    "/api/staff",
  ],
  settings: [
    "/api/audit",
    "/api/settings/users",
    "/api/settings/lists",
    "/api/settings/sla",
    "/api/settings/email",
    "/api/settings/email/outbox",
    `/api/settings/kpi-targets?year=${new Date().getFullYear()}`,
  ],
};
const AREAS = { admin: ["request", "it", "settings"], it: ["request", "it"], employee: ["request"] } as const;

/** Each API that answers other than expected, with what it answered. */
async function unexpectedAnswers(page: Page, expected: (area: keyof typeof APIS) => number) {
  const wrong: string[] = [];
  for (const [area, urls] of Object.entries(APIS) as [keyof typeof APIS, string[]][]) {
    for (const url of urls) {
      const status = (await page.request.get(url)).status();
      if (status !== expected(area)) wrong.push(`${url} answered ${status}, expected ${expected(area)}`);
    }
  }
  return wrong;
}

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

    test("the API answers for the role's areas and refuses the rest", async ({ page }) => {
      const areas: readonly string[] = AREAS[role];
      const wrong = await unexpectedAnswers(page, (area) => (areas.includes(area) ? 200 : 403));
      expect(wrong, wrong.join("\n")).toEqual([]);
    });

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

  test("the dashboard address takes an employee to their own dashboard", async ({ page }) => {
    await page.goto("/ar");
    await expect(page).toHaveURL(/\/ar\/home$/);
    await expect(heading(page)).toHaveText(ar.home.title);
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

test("the API refuses a signed-out visitor", async ({ page }) => {
  const wrong = await unexpectedAnswers(page, () => 401);
  expect(wrong, wrong.join("\n")).toEqual([]);
});
