import { readFile } from "node:fs/promises";
import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole, xlsxFile } from "./helpers";

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

    // Its AnyDesk ID, however it is written, opens AnyDesk to it.
    await page.getByRole("button", { name: "Edit" }).click();
    await dialog.getByLabel("AnyDesk ID").fill("12 34");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Use the 9- or 10-digit ID AnyDesk shows")).toBeVisible();
    await dialog.getByLabel("AnyDesk ID").fill("1 234 567 890");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("1 234 567 890")).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect with AnyDesk" })).toHaveAttribute("href", "anydesk:1234567890");

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

test("a ticket offers AnyDesk to the requester's computer", async ({ page }) => {
  const console = watchConsole(page);
  type Ticket = { id: number; requesterId: number; assetId?: number | null };
  type Asset = { id: number; name: string; assignedTo: number | null; anydeskId: string | null; status: string };
  const tickets = (await (await page.request.get("/api/tickets")).json()) as Ticket[];
  const assets = (await (await page.request.get("/api/assets")).json()) as Asset[];
  const held = (t: Ticket) => assets.filter((a) => a.assignedTo === t.requesterId && a.anydeskId && a.status !== "retired");
  // A ticket about no device in particular, from someone with one computer.
  let ticket: Ticket | undefined;
  for (const candidate of tickets.filter((t) => held(t).length === 1)) {
    const detail = (await (await page.request.get(`/api/tickets/${candidate.id}`)).json()) as Ticket;
    if (detail.assetId === null) {
      ticket = detail;
      break;
    }
  }
  const [laptop] = held(ticket!);
  await page.goto(`/en/tickets/${ticket!.id}`);
  await expect(page.getByRole("link", { name: `Connect to ${laptop.name} with AnyDesk` })).toHaveAttribute("href", `anydesk:${laptop.anydeskId}`);
  console.assertClean();
});

test("assets are loaded from a spreadsheet: checked first, then added and updated", async ({ page }, info) => {
  const console = watchConsole(page);
  type Asset = { id: number; name: string; type: string; serial: string | null; notes: string | null; anydeskId: string | null };
  const before = (await (await page.request.get("/api/assets")).json()) as Asset[];
  const monitor = before.find((a) => a.type === "monitor")!;
  const name = unique(info, "LT-IMPORT");
  const serial = name.replace(/\W+/g, "");
  const tag = `AST-${String(monitor.id).padStart(4, "0")}`;
  const file = xlsxFile("inventory.xlsx", [
    ["Tag", "Name", "Type", "Location", "Serial", "AnyDesk ID", "Cost (SAR)", "Notes", "Colour"],
    ["", name, "Laptop", "Jeddah Head Office", serial, "1 357 913 579", 4300, "", "Black"],
    [tag, "", "", "", "", "", "", "Checked in the import", ""],
    ["", "PLT-01", "Plotter", "Jeddah", "", "", "", "", ""],
  ]);

  await page.goto("/en/assets/import");
  await expect(page.getByRole("link", { name: "Import" })).toHaveAttribute("aria-current", "page");
  const [template] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download template" }).click()]);
  expect(template.suggestedFilename()).toBe("assets-template.csv");

  // A file that is not a spreadsheet is refused.
  await page.getByLabel("Excel or CSV file").setInputFiles({ name: "notes.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("not a workbook") });
  await expect(page.getByRole("alert").filter({ hasText: "Choose an Excel (.xlsx) or CSV file." })).toBeVisible();

  // Checked first: nothing changes yet.
  await page.getByLabel("Excel or CSV file").setInputFiles(file);
  await expect(page.getByRole("heading", { name: "What loading inventory.xlsx will do" })).toBeVisible();
  for (const count of ["1 to add", "1 to update", "0 unchanged", "1 with problems, left out"]) await expect(page.getByText(count, { exact: true })).toBeVisible();
  await expect(page.getByText("Columns not used: Colour")).toBeVisible();
  await expect(page.getByRole("row", { name: /PLT-01/ })).toContainText('Type "Plotter" is not in the list.');
  await expect(page.getByRole("row", { name: new RegExp(monitor.name) })).toContainText("Changes: Notes");
  expect(((await (await page.request.get("/api/assets")).json()) as Asset[]).some((a) => a.name === name)).toBe(false);

  await page.getByRole("button", { name: "Load 2 assets" }).click();
  await expect(page.getByText("1 added and 1 updated.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "inventory.xlsx is loaded" })).toBeVisible();
  const after = (await (await page.request.get("/api/assets")).json()) as Asset[];
  expect(after.find((a) => a.name === name)).toMatchObject({ serial, anydeskId: "1357913579" });
  expect(after.find((a) => a.id === monitor.id)).toMatchObject({ notes: "Checked in the import", name: monitor.name });

  // Loaded again, the file changes nothing: the laptop is found by its serial now.
  await page.getByRole("button", { name: "Load another file" }).click();
  await page.getByLabel("Excel or CSV file").setInputFiles(file);
  await expect(page.getByText("2 unchanged", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load 0 assets" })).toBeDisabled();
  console.assertClean();
});

test("documents are attached to an asset, open and download, and a disguised file is refused", async ({ page }, info) => {
  const console = watchConsole(page);
  const [asset] = (await (await page.request.get("/api/assets")).json()) as { id: number }[];
  const name = `${unique(info, "Invoice").replace(/\s+/g, "-")}.pdf`;
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
  await page.goto(`/en/assets/${asset.id}`);
  const documents = page.locator("[data-slot=card]").filter({ has: page.locator("[data-slot=card-title]", { hasText: /^Documents$/ }) });

  // A web page renamed .pdf is refused, by its content.
  await documents.getByLabel("File").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><body>not a pdf</body></html>") });
  await documents.getByRole("button", { name: "Upload" }).click();
  await expect(documents.getByRole("alert")).toHaveText("Only PDF, JPG and PNG files can be uploaded.");

  await documents.getByLabel("File").setInputFiles({ name, mimeType: "application/pdf", buffer: pdf });
  await documents.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Document uploaded.")).toBeVisible();
  const item = documents.getByRole("listitem").filter({ hasText: name });
  await expect(item).toContainText("Invoice");

  const download = await item.getByRole("link", { name: `Download ${name}` }).getAttribute("href");
  const res = await page.request.get(download!);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(Buffer.from(await res.body())).toEqual(pdf);

  await item.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Document deleted.")).toBeVisible();
  await expect(item).toHaveCount(0);
  console.assertClean();
});

test.describe("tags", () => {
  test("tags are chosen, previewed, and saved for the label printer", async ({ page }, info) => {
    const console = watchConsole(page);
    const prefix = unique(info, "TAG-TEST");
    const ids: number[] = [];
    for (const n of [1, 2]) {
      const res = await page.request.post("/api/assets", {
        data: { name: `${prefix}-${n}`, serial: `SN-${prefix}-${n}`, category: "end_user", type: "laptop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "low", monitorMethod: "none" },
      });
      expect(res.ok()).toBe(true);
      ids.push(((await res.json()) as { id: number }).id);
    }
    const tags = ids.map((id) => `AST-${String(id).padStart(4, "0")}`);

    await page.goto("/en/assets/inventory");
    await page.getByRole("tab", { name: "Tags" }).or(page.getByRole("link", { name: "Tags" })).click();
    await expect(page).toHaveURL(/\/en\/assets\/tags$/);
    await expect(page.getByRole("switch", { name: "Not tagged yet only" })).toBeChecked();
    await page.getByLabel("Search by tag, name, serial or location").fill(prefix);
    const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("Select assets to see their tag here.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Select all shown" }).check();
    await expect(page.getByText("2 assets selected")).toBeVisible();
    await expect(page.getByRole("img", { name: `Tag for ${tags[0]}, as it will print` })).not.toHaveClass(/animate-pulse/);
    await expect(page.getByText("No label printer is set up.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Print on label printer" })).toHaveCount(0);

    await page.getByLabel("Copies of each tag").fill("2");
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZPL file" }).click()]);
    expect(file.suggestedFilename()).toBe("asset-tags.zpl");
    const zpl = await readFile((await file.path())!, "utf8");
    for (const tag of tags) expect(zpl).toContain(`^FD${tag}^FS`);
    expect(zpl.match(/\^PQ2/g)).toHaveLength(2);

    // Tagged now: they leave the list of assets still to tag, and show when.
    await expect(page.getByText("No assets match.")).toBeVisible();
    await expect(page.getByText("No assets selected")).toBeVisible();
    await page.getByRole("switch", { name: "Not tagged yet only" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Not yet" })).toHaveCount(0);

    // The PDF opens in a tab of its own, for the printer's driver.
    await page.getByRole("checkbox", { name: `Select ${tags[1]}` }).check();
    const [tab] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open PDF to print" }).click()]);
    await expect.poll(() => tab.url()).toMatch(/^blob:/);
    await tab.close();

    // From the asset's own page, its tag is chosen already.
    await page.goto(`/en/assets/${ids[0]}`);
    await page.getByRole("link", { name: "Print tag" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/assets/tags\\?ids=${ids[0]}$`));
    await expect(page.getByRole("checkbox", { name: `Select ${tags[0]}` })).toBeChecked();
    await expect(page.getByText("1 asset selected")).toBeVisible();
    console.assertClean();
  });
});
