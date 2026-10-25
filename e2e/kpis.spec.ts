import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { unique, watchConsole, xlsxFile } from "./helpers";

/** Browsers run side by side on one database, so each records figures for its own year. */
const slot = (info: TestInfo) => ["chromium", "firefox", "webkit"].indexOf(info.project.name);
const thisYear = new Date().getFullYear();

async function chooseYear(page: Page, year: number) {
  await page.getByRole("combobox", { name: "Year" }).click();
  await page.getByRole("option", { name: String(year), exact: true }).click();
}

test.describe("as IT staff", () => {
  test.use({ storageState: session("it") });

  test("the register shows each role's KPIs by month, with targets, status and score", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en/kpis");
    await expect(page.getByRole("heading", { name: "KPIs", level: 1 })).toBeVisible();
    for (const role of ["IT department", "IT Manager", "IT Officer"]) await expect(page.getByRole("heading", { name: role, level: 2 })).toBeVisible();
    for (const kpi of ["Tickets resolved within SLA", "Complaints (SLA breaches)", "IT training hours", "ISO 9001 non-conformities", "IT service satisfaction", "System availability"]) {
      await expect(page.getByRole("rowheader", { name: new RegExp(kpi.replace(/[()]/g, "\\$&")) })).toBeVisible();
    }
    // The IT manager's KPIs carry weights, and their role is scored.
    await expect(page.getByText(/^Score \d/).first()).toBeVisible();
    // Only admins change the register itself.
    await expect(page.getByRole("button", { name: "Add KPI" })).toHaveCount(0);
    // Last year's training hours, quarter by quarter, against the year's target of 150.
    await chooseYear(page, thisYear - 1);
    const training = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /IT training hours/ }) });
    await expect(training).toContainText("133 h");
    await expect(training).toContainText("Improving");
    console.assertClean();
  });

  test("a quarter is shown on its own: its months, figure, target and status", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en/kpis");
    await chooseYear(page, thisYear - 1);
    await page.getByRole("combobox", { name: "Period" }).click();
    await page.getByRole("option", { name: `Q2 ${thisYear - 1}` }).click();
    // Only the quarter's months, and the quarter in place of the year so far.
    await expect(page.getByRole("columnheader", { name: "Apr" }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Jan" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: `Q2 ${thisYear - 1}` }).first()).toBeVisible();
    // Last year's second quarter: 35 training hours against a quarter of the year's 150.
    const training = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /IT training hours/ }) });
    await expect(training).toContainText("37.5 h");
    await expect(training).toContainText("a quarter of the year's");
    await expect(training.getByRole("cell").filter({ hasText: /^35 h$/ }).first()).toBeVisible();
    await expect(training).toContainText("Improving");
    console.assertClean();
  });

  test("IT staff record a quarter's figure with a note, and the year and status follow", async ({ page }, info) => {
    const console = watchConsole(page);
    const year = thisYear - 2 - slot(info);
    await page.goto("/en/kpis");
    await chooseYear(page, year);
    const training = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /IT training hours/ }) });
    for (const [q, hours] of [[1, "100"], [2, "60"]] as const) {
      await training.getByRole("button", { name: new RegExp(`^IT training hours, Q${q} ${year}:`) }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Figure").fill(hours);
      if (q === 1) await dialog.getByLabel("Note").fill("Udemy Business courses");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(training).toContainText("160 h");
    await expect(training).toContainText("On target");
    await expect(training.getByRole("button", { name: new RegExp(`Q1 ${year}: 100 h, On target. Udemy Business courses`) })).toBeVisible();
    // Cleared again.
    await training.getByRole("button", { name: new RegExp(`^IT training hours, Q2 ${year}:`) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear" }).click();
    await expect(training).toContainText("100 h");
    console.assertClean();
  });

  test("a month's share is entered as counts, and a ticket SLA figure can be explained", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en/kpis");
    const backups = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /Backup and recovery readiness/ }) });
    await backups.getByRole("button", { name: /^Backup and recovery readiness, January/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Done").fill("52");
    await dialog.getByLabel("Out of").fill("51");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Enter both counts, the first no more than the second.")).toBeVisible();
    await dialog.getByLabel("Done").fill("50");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(backups.getByRole("button", { name: /January \d{4}: 98\.04%/ })).toBeVisible();
    console.assertClean();
  });

  test("the register downloads as an Excel workbook", async ({ page }) => {
    await page.goto("/en/kpis");
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export to Excel" }).click()]);
    expect(file.suggestedFilename()).toBe(`kpi-register-${thisYear}.xlsx`);
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  test("the KPIs page reads right to left in Arabic", async ({ page }) => {
    await page.goto("/ar/kpis");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "مؤشرات الأداء", level: 1 })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /ساعات تدريب فريق التقنية/ })).toBeVisible();
  });
});

test.describe("as the IT manager", () => {
  test.use({ storageState: session("admin") });

  test("a KPI is added, weighted, edited and deleted", async ({ page }, info) => {
    const console = watchConsole(page);
    const code = unique(info, "CYB").replace(/\s+/g, "-");
    await page.goto("/en/kpis");
    await page.getByRole("button", { name: "Add KPI" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("KPI ID").fill(code);
    await dialog.getByLabel("Name", { exact: true }).fill("Patch compliance");
    await dialog.getByLabel("Role / applies to").fill("Cyber Security Officer");
    await dialog.getByLabel("Target (%)").fill("90");
    await dialog.getByLabel("Weight (%)").fill("20");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: new RegExp(code) }) });
    await expect(row).toContainText("90%");
    await expect(row).toContainText("20%");
    await expect(page.getByRole("heading", { name: "Cyber Security Officer", level: 2 })).toBeVisible();

    await page.getByRole("button", { name: `Edit ${code}` }).click();
    await dialog.getByLabel("Target (%)").fill("95");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row).toContainText("95%");
    await page.getByRole("button", { name: `Edit ${code}` }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: new RegExp(code) })).toHaveCount(0);
    console.assertClean();
  });

  test("the register is imported from Excel, checked first", async ({ page }, info) => {
    const console = watchConsole(page);
    const code = unique(info, "3-IT-OFF").replace(/\s+/g, "-");
    const header = ["KPI ID", "Level", "Department", "Role / Applies To", "KPI Name", "Definition", "Calculation / Formula", "Measurement Direction", "Frequency", "Primary Data Source", "Reviewer", "Baseline", "Target", "Weight %", "July", "August"];
    const file = xlsxFile("IT_KPIs.xlsx", [
      ["Master KPI Register"],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", `Weight % ${thisYear}`],
      header,
      [code, "Employee", "IT", "IT Officer", "Backup completion support", "Backups verified.", "Verified ÷ planned.", "Higher is better", "Daily / Monthly", "Backup logs", "IT Manager", 0.9, 0.95, 0.25, 1, 0.98],
      ["", "Employee", "IT", "IT Officer", "No ID here", "", "", "", "", "", "", "", "x", "", "", ""],
    ]);
    await page.goto("/en/kpis");
    await page.getByRole("button", { name: "Import register" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Excel file (.xlsx)").setInputFiles(file);
    await expect(dialog.getByText(`For ${thisYear}:`)).toBeVisible();
    await expect(dialog.getByText("1 to add")).toBeVisible();
    await expect(dialog.getByRole("row", { name: /No ID here/ })).toContainText("It has no KPI ID.");
    await dialog.getByRole("button", { name: "Load 1 KPI" }).click();
    await expect(page.getByText(`1 added and 0 updated for ${thisYear}.`)).toBeVisible();
    const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: new RegExp(code) }) });
    await expect(row).toContainText("25%");
    await expect(row.getByRole("button", { name: /July \d{4}: 100%/ })).toBeVisible();
    await expect(row.getByRole("button", { name: /August \d{4}: 98%/ })).toBeVisible();
    console.assertClean();
  });

  test("an API key lets another system read the KPIs, until it is revoked", async ({ page, playwright }, info) => {
    const console = watchConsole(page);
    const name = unique(info, "Board dashboard");
    await page.goto("/en/settings/api");
    await page.getByLabel("Key name").fill(name);
    await page.getByRole("button", { name: "Make a key" }).click();
    const shown = page.getByRole("status").filter({ hasText: `The key for ${name}` });
    await expect(shown).toBeVisible();
    const token = (await shown.locator("code").textContent())!;
    expect(token).toMatch(/^apit_/);

    const other = await playwright.request.newContext({ baseURL: new URL(page.url()).origin });
    expect((await other.get(`/api/public/kpis?year=${thisYear}`)).status()).toBe(401);
    const read = await other.get(`/api/public/kpis?year=${thisYear}`, { headers: { authorization: `Bearer ${token}` } });
    expect(read.status()).toBe(200);
    const body = (await read.json()) as { year: number; kpis: { code: string }[] };
    expect(body.year).toBe(thisYear);
    expect(body.kpis.map((k) => k.code)).toContain("IT-TRAINING");

    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke" }).click();
    await expect(row).toContainText("Revoked");
    expect((await other.get(`/api/public/kpis?year=${thisYear}`, { headers: { authorization: `Bearer ${token}` } })).status()).toBe(401);
    await other.dispose();
    console.assertClean();
  });
});
