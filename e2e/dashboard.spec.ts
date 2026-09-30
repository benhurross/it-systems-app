import { expect, test } from "@playwright/test";
import { session } from "./env";
import { watchConsole } from "./helpers";

test.use({ storageState: session("it") });

test("the dashboard shows the headline figures and what needs attention", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  for (const label of [
    "Open tickets",
    "Resolved within SLA",
    "Average resolution",
    "Network availability",
    "Assets in use",
    "Licence compliance",
    "Budget used",
    "Open high risks",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // The demo data has a Riyadh access point down.
  const down = page.getByRole("region", { name: "Devices down" });
  await expect(down.getByRole("link", { name: "AP-RYD-03" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Licences expiring or expired" })).toBeVisible();

  await page.getByRole("link", { name: /Open tickets/ }).click();
  await expect(page).toHaveURL(/\/en\/tickets$/);
  console.assertClean();
});

test("the dashboard reads right to left in Arabic", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("التذاكر المفتوحة", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "بحاجة إلى متابعة" })).toBeVisible();
});
