import { readFile } from "node:fs/promises";
import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

/** Browsers run side by side on one database, so each takes its own record where two would clash. */
const slot = (info: TestInfo) => ["chromium", "firefox", "webkit"].indexOf(info.project.name);

test.use({ storageState: session("it") });

test.describe("inventory", () => {
  test("filters by category and by lifecycle flags", async ({ page }) => {
    const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await page.goto("/en/assets/inventory");
    await page.getByRole("button", { name: "Category", expanded: false }).click();
    await page.getByRole("menuitemcheckbox", { name: /Printers and Peripheral Devices/ }).click();
    await page.keyboard.press("Escape");
    await expect(rows.first()).toContainText("Printers and Peripheral Devices");
    await expect(rows.filter({ hasNotText: "Printers and Peripheral Devices" })).toHaveCount(0);

    await page.getByRole("switch", { name: "Needs attention only" }).click();
    await expect(rows.first()).toBeVisible();
    await expect(rows.filter({ hasNotText: /Warranty ends soon|Warranty expired|Unsupported|Due for replacement/ })).toHaveCount(0);
  });

  test("register, move and retire an asset", async ({ page }, info) => {
    const console = watchConsole(page);
    const name = unique(info, "LT-TEST");
    await page.goto("/en/assets/inventory");
    await page.getByRole("button", { name: "Add asset" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await choose(page, "Category", "End-User Devices");
    await choose(page, "Type", "Laptop");
    await choose(page, "Location", "Jeddah Head Office");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/en\/assets\/\d+$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText("In stock", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await dialog.getByLabel("Model").fill("Latitude 5550");
    await choose(page, "Check with", "TCP port");
    await dialog.getByLabel("TCP port").fill("3389");
    await dialog.getByRole("button", { name: "Save" }).click();
    // A monitored device needs an address.
    await expect(dialog.getByText("Add an IP address to monitor this device.")).toBeVisible();
    await dialog.getByLabel("IP address").fill("10.99.0.5");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Latitude 5550")).toBeVisible();
    await expect(page.getByText("TCP port 3389")).toBeVisible();

    await page.getByRole("button", { name: "Move or reassign" }).click();
    await choose(page, "New location", "Riyadh Branch");
    await page.getByRole("combobox", { name: "Assign to" }).click();
    await page.getByPlaceholder("Search").fill("Nora");
    await page.getByRole("option", { name: /Nora Al-Otaibi/ }).click();
    await dialog.getByLabel("Reason").fill("New starter kit");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "New starter kit" })).toBeVisible();
    await expect(page.getByText("In use", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Retire" }).click();
    await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Move or reassign" })).toHaveCount(0);
    console.assertClean();
  });
});

test("discovery finds this machine and adds it to the inventory", async ({ page }, info) => {
  const ip = `127.0.0.${11 + slot(info)}`;
  const name = unique(info, "Discovered");
  await page.goto("/en/assets/discovery");
  await page.getByLabel("Range to scan").fill(`${ip}/32`);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await expect(page.getByText(`Scan of ${ip}/32 complete. Devices found: 1`)).toBeVisible({ timeout: 20_000 });

  const row = page.getByRole("row").filter({ hasText: ip });
  await expect(row).toContainText("Not in inventory");
  await row.getByRole("button", { name: "Add to inventory" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("IP address")).toHaveValue(ip);
  await dialog.getByLabel("Name").fill(name);
  await choose(page, "Category", "Network Devices");
  await choose(page, "Type", "Network Switch");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(ip, { exact: true })).toBeVisible();
});

test("the CMDB shows what fails with an item and edits its relationships", async ({ page }, info) => {
  const console = watchConsole(page);
  const printer = ["PRN-JED-FIN", "PRN-JED-OPS", "PRN-JED-HR"][slot(info)];
  const search = page.getByRole("searchbox", { name: "Find an item" });
  await page.goto("/en/cmdb");
  await search.fill("DC01");
  await page.getByRole("button", { name: /^DC01/ }).click();

  // The applications on DC01 go down with it; the backup server that copies it does not.
  await expect(page.getByText("Items affected: 3")).toBeVisible();
  for (const app of ["Oasis ERP", "Company email", "Shared folders"]) {
    await expect(page.getByRole("button", { name: app, exact: true })).toBeVisible();
  }
  await expect(page.locator(".react-flow__node", { hasText: "BACKUP01" })).toBeVisible();
  await page.locator(".react-flow__node", { hasText: "ESX-01" }).click();
  await expect(page.getByRole("link", { name: "ESX-01" })).toBeVisible();

  await search.fill(printer);
  await page.getByRole("button", { name: new RegExp(`^${printer}`) }).click();
  await page.getByRole("button", { name: "Add relationship" }).click();
  await page.getByRole("combobox", { name: "Related item" }).click();
  await page.getByPlaceholder("Search").fill("UPS-JED-DC");
  await page.getByRole("option", { name: "UPS-JED-DC" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  const remove = page.getByRole("button", { name: "Remove: UPS-JED-DC" });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  console.assertClean();
});

test("software tracks seats against installs and exports an audit report", async ({ page }, info) => {
  const console = watchConsole(page);
  const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  const product = unique(info, "Diagram Suite");
  await page.goto("/en/software");
  await expect(page.getByRole("cell", { name: "Adobe Acrobat Pro" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Audit report" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^licence-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile(await file.path(), "utf8");
  expect(csv).toContain("Licence,Product,Vendor,Version,Type,Seats bought,Installed,Purchased,Expires,Compliance,Key location");
  expect(csv).toContain("Adobe Acrobat Pro");

  await page.getByRole("button", { name: "Compliance", expanded: false }).click();
  await page.getByRole("menuitemcheckbox", { name: /Over-deployed/ }).click();
  await page.keyboard.press("Escape");
  await expect(rows.first()).toContainText("Over-deployed");
  await expect(rows.filter({ hasNotText: "Over-deployed" })).toHaveCount(0);

  await page.getByRole("button", { name: "Add licence" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product").fill(product);
  await dialog.getByLabel("Seats bought").fill("1");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/en\/software\/\d+$/);
  await expect(page.getByRole("heading", { name: product })).toBeVisible();

  for (const device of ["DT-001", "LT-001"]) {
    await page.getByRole("button", { name: "Record an installation" }).click();
    await page.getByRole("combobox", { name: "Device" }).click();
    await page.getByPlaceholder("Search").fill(device);
    await page.getByRole("option", { name: new RegExp(device) }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("link", { name: new RegExp(device) })).toBeVisible();
  }
  await expect(page.getByText("Over-deployed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove: LT-001" }).click();
  await expect(page.getByText("Compliant", { exact: true })).toBeVisible();
  console.assertClean();
});
