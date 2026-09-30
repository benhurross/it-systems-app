import { expect, test } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

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

test("a hardware purchase goes from request to the inventory", async ({ page }, info) => {
  const console = watchConsole(page);
  const item = unique(info, "Docking station");
  await page.goto("/en/finance/purchases");
  await page.getByRole("button", { name: "New request" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item").fill(item);
  await choose(page, "Budget category", "Hardware");
  await dialog.getByLabel("Quantity").fill("2");
  await dialog.getByLabel("Total amount").fill("1800");
  await dialog.getByRole("switch", { name: "Hardware" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();

  const row = page.getByRole("row").filter({ hasText: item });
  await expect(row).toContainText("Requested");
  const ref = (await row.getByRole("cell").first().textContent())!.trim();
  for (const [step, status] of [
    ["Approve", "Approved"],
    ["Mark as ordered", "Ordered"],
    ["Mark as received", "Received"],
  ]) {
    await row.getByRole("button", { name: `Actions for ${ref}` }).click();
    await page.getByRole("menuitem", { name: step }).click();
    await expect(row).toContainText(status);
  }

  await row.getByRole("button", { name: `Actions for ${ref}` }).click();
  await page.getByRole("menuitem", { name: "Add to inventory" }).click();
  await expect(dialog.getByLabel("Purchase cost")).toHaveValue("900");
  await dialog.getByLabel("Name").fill(item);
  await choose(page, "Category", "End-User Devices");
  await choose(page, "Type", "Laptop");
  await choose(page, "Location", "Jeddah Head Office");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/en\/assets\/\d+$/);
  await expect(page.getByRole("link", { name: ref })).toBeVisible();
  console.assertClean();
});
