import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, watchConsole } from "./helpers";

/** Browsers run side by side on one database, so each records figures for its own year. */
const slot = (info: TestInfo) => ["chromium", "firefox", "webkit"].indexOf(info.project.name);

test.use({ storageState: session("it") });

test("the KPIs page shows the five KPIs with their targets and status", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/kpis");
  await expect(page.getByRole("heading", { name: "KPIs" })).toBeVisible();
  for (const kpi of [
    "Tickets resolved within SLA",
    "Complaints (SLA breaches)",
    "IT training hours",
    "ISO 9001 non-conformities",
    "IT service satisfaction",
  ]) {
    await expect(page.getByRole("rowheader", { name: new RegExp(kpi.replace(/[()]/g, "\\$&")) })).toBeVisible();
  }
  // The demo data has 125 training hours so far against a target of 150.
  const training = page.getByRole("row").filter({ hasText: "IT training hours" });
  await expect(training).toContainText("125");
  await expect(training).toContainText("Improving");
  console.assertClean();
});

test("IT staff record a year's training hours, and the total and status follow", async ({ page }, info) => {
  const year = new Date().getFullYear() - 1 - slot(info);
  await page.goto("/en/kpis");
  await choose(page, "Year", String(year));
  await page.getByRole("button", { name: `Record IT training hours for ${year}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Q1").fill("100");
  await dialog.getByLabel("Q2").fill("60");
  await dialog.getByLabel("Q3").fill("");
  await dialog.getByLabel("Q4").fill("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const training = page.getByRole("row").filter({ hasText: "IT training hours" });
  await expect(training).toContainText("160");
  await expect(training).toContainText("On target");
});

test("the KPIs page reads right to left in Arabic", async ({ page }) => {
  await page.goto("/ar/kpis");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "مؤشرات الأداء" })).toBeVisible();
});
