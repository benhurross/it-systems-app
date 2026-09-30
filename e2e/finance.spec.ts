import { expect, test } from "@playwright/test";
import { session } from "./env";
import { choose, watchConsole } from "./helpers";

test.use({ storageState: session("it") });

test("the budget compares allocation with commitments and lists renewals due", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/finance");
  await expect(page).toHaveURL(/\/en\/finance\/budget$/);
  await expect(page.getByRole("heading", { name: "Finance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Budget", exact: true })).toHaveAttribute("aria-current", "page");

  const hardware = page.getByRole("row").filter({ hasText: "Hardware" });
  await expect(hardware).toContainText("180,000");
  await expect(hardware.getByRole("progressbar")).toBeVisible();

  // The demo data has two contracts ending within 90 days and one that has already expired.
  const renewals = page.getByRole("list", { name: "Renewals in the next 90 days" });
  await expect(renewals).toContainText("UPS maintenance");
  await expect(renewals).toContainText("Backup internet line, Jeddah");
  await expect(renewals).not.toContainText("Site-to-site VPN service");

  // Last year's demo budget is 90% of this year's.
  const picker = page.getByRole("combobox", { name: "Fiscal year" });
  const year = Number((await picker.textContent())!.replace(/\D/g, ""));
  await choose(page, "Fiscal year", `FY${year - 1}`);
  await expect(hardware).toContainText("162,000");
  console.assertClean();
});
