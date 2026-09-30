import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

/** Browsers run side by side on one database, so each works on its own budget line. */
const slot = (info: TestInfo) => ["chromium", "firefox", "webkit"].indexOf(info.project.name);

test.use({ storageState: session("it") });

test("a purchase goes from request to approval, receipt and the inventory", async ({ page }, info) => {
  const console = watchConsole(page);
  const item = unique(info, "Rugged laptops");
  const laptop = unique(info, "LT-RUGGED");
  await page.goto("/en/finance/purchases");
  await page.getByRole("button", { name: "New request" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item").fill(item);
  await choose(page, "Budget category", "Hardware");
  await dialog.getByLabel("Quantity").fill("2");
  await dialog.getByLabel("Total (SAR)").fill("9000");
  await dialog.getByRole("switch", { name: "Hardware for the inventory" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("textbox", { name: "Filter rows" }).fill(item);
  const row = page.getByRole("row").filter({ hasText: item });
  await expect(row).toContainText("Requested");
  for (const [action, status] of [
    ["Approve", "Approved"],
    ["Mark as ordered", "Ordered"],
    ["Mark as received", "Received"],
  ]) {
    await row.getByRole("button", { name: `Actions for ${item}` }).click();
    await page.getByRole("menuitem", { name: action }).click();
    await expect(row).toContainText(status);
  }
  await expect(row).toContainText("In inventory: 0 of 2");

  await row.getByRole("button", { name: `Actions for ${item}` }).click();
  await page.getByRole("menuitem", { name: "Add to inventory" }).click();
  await expect(dialog.getByLabel("Purchase cost (SAR)")).toHaveValue("4500");
  await dialog.getByLabel("Name").fill(laptop);
  await choose(page, "Category", "End-User Devices");
  await choose(page, "Type", "Laptop");
  await choose(page, "Location", "Jeddah Head Office");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: laptop })).toBeVisible();
  await expect(page.getByRole("link", { name: /^PR-\d+$/ })).toBeVisible();

  await page.goto("/en/finance/purchases");
  await page.getByRole("textbox", { name: "Filter rows" }).fill(item);
  await expect(page.getByRole("row").filter({ hasText: item })).toContainText("In inventory: 1 of 2");
  console.assertClean();
});

test("the budget takes a new amount and moves between fiscal years", async ({ page }, info) => {
  const category = ["Cloud and hosting", "Security", "Internet and connectivity"][slot(info)];
  const amount = String(40_000 + slot(info) * 1_000);
  await page.goto("/en/finance/budget");
  const year = Number((await page.getByText(/^FY \d{4}$/).textContent())!.slice(3));

  await page.getByRole("button", { name: `Set the ${category} budget` }).click();
  await page.getByRole("dialog").getByLabel("Amount (SAR)").fill(amount);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("row").filter({ hasText: category })).toContainText(`SAR ${Number(amount).toLocaleString("en-GB")}`);

  await page.getByRole("button", { name: "Previous year" }).click();
  await expect(page.getByText(`FY ${year - 1}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next year" }).click();
  await expect(page.getByText(`FY ${year}`, { exact: true })).toBeVisible();
});

test("a contract ending soon shows as due for renewal, on the register and the budget", async ({ page }, info) => {
  const title = unique(info, "Plotter maintenance");
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await page.goto("/en/finance/contracts");
  await page.getByRole("button", { name: "Add contract" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contract", { exact: true }).fill(title);
  await choose(page, "Budget category", "Support and services");
  await dialog.getByLabel("Starts").fill(inDays(-335));
  await dialog.getByLabel("Ends").fill(inDays(30));
  await dialog.getByLabel("Annual cost (SAR)").fill("5000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("textbox", { name: "Filter rows" }).fill(title);
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("Renewal due");
  await page.getByRole("link", { name: "Budget" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

test("a vendor is added and later marked inactive", async ({ page }, info) => {
  const name = unique(info, "Harbour Cabling Co");
  await page.goto("/en/finance/vendors");
  await page.getByRole("button", { name: "Add vendor" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vendor", { exact: true }).fill(name);
  await choose(page, "Category", "Services provider");
  await dialog.getByLabel("Email").fill("sales@harbour.test");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("textbox", { name: "Filter rows" }).fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Active");
  await row.getByRole("button", { name }).click();
  await dialog.getByRole("switch", { name: "Active" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Inactive");
});
