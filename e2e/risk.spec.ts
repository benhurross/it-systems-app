import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

/** Browsers run side by side, so each places its risk in a square no other test uses. */
const square = (info: TestInfo) =>
  [
    { likelihood: "5 - Almost certain", impact: "1 - Negligible", cell: "Likelihood 5, impact 1" },
    { likelihood: "1 - Rare", impact: "5 - Severe", cell: "Likelihood 1, impact 5" },
    { likelihood: "1 - Rare", impact: "1 - Negligible", cell: "Likelihood 1, impact 1" },
  ][["chromium", "firefox", "webkit"].indexOf(info.project.name)];

test.use({ storageState: session("it") });

test("a new risk lands on the heatmap and leaves it once closed", async ({ page }, info) => {
  const console = watchConsole(page);
  const title = unique(info, "Courier loses backup tapes");
  const { likelihood, impact, cell } = square(info);
  await page.goto("/en/risk");
  await expect(page).toHaveURL(/\/en\/risk\/register$/);
  await expect(page.getByRole("button", { name: `${cell}. Open risks: 0` })).toBeVisible();

  await page.getByRole("button", { name: "Log risk" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Risk", { exact: true }).fill(title);
  await choose(page, "Category", "Business continuity");
  await choose(page, "Likelihood", likelihood);
  await choose(page, "Impact", impact);
  await dialog.getByLabel("Description").fill("Tapes travel off site with a courier and are not encrypted.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: new RegExp(`^${cell}\\. Open risks: 1 `) }).click();
  await expect(page.getByText(`Showing ${cell.toLowerCase()}`)).toBeVisible();
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(title);

  await rows.first().getByRole("button", { name: title }).click();
  await choose(page, "Status", "Closed");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${cell}\\. Open risks: 0 `) })).toBeVisible();
  console.assertClean();
});

test("vulnerabilities past their deadline are flagged overdue", async ({ page }, info) => {
  const title = unique(info, "Old SSH version on the NVR");
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.goto("/en/risk/vulnerabilities");
  await page.getByRole("button", { name: "Log vulnerability" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vulnerability", { exact: true }).fill(title);
  await choose(page, "Severity", "High");
  await dialog.getByLabel("Fix by").fill(yesterday);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("switch", { name: "Overdue only" }).click();
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows.filter({ hasText: title })).toContainText("Overdue");
  await expect(rows.filter({ hasNotText: "Overdue" })).toHaveCount(0);
});
