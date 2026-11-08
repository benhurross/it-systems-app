import { expect, test, type Page } from "@playwright/test";
import { session } from "./env";
import { unique, watchConsole } from "./helpers";

// IT records a desk check; the employee reads it once, in the app or at Windows sign-in, and IT
// sees who has read theirs. The sign-in script reaches the app only with a workstation key.

/** A desktop on the inventory, assigned to no one unless given. */
async function desktop(page: Page, name: string, assignedTo: number | null = null) {
  const res = await page.request.post("/api/assets", {
    data: { name, category: "end_user", type: "desktop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "medium", monitorMethod: "none", assignedTo },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: number }).id;
}

/** Records a check through its form, from the computer's page, with one item not OK. */
async function checkFromAssetPage(page: Page, assetId: number, employee: string, note: string, message: string) {
  await page.goto(`/en/assets/${assetId}`);
  const card = page.locator("[data-slot='card']").filter({ has: page.locator("[data-slot='card-title']", { hasText: /^Workstation checks$/ }) });
  await expect(card.getByText("No checks yet.")).toBeVisible();
  await card.getByRole("button", { name: "New check" }).click();
  const dialog = page.getByRole("dialog", { name: "New check" });
  await expect(dialog.getByRole("combobox", { name: "Computer" })).not.toHaveText("Select…");
  await dialog.getByRole("combobox", { name: /Employee/ }).click();
  await page.getByRole("option", { name: employee, exact: true }).click();
  await expect(dialog.getByText("Passed", { exact: true })).toBeVisible();
  await dialog.getByRole("radiogroup", { name: /No confidential papers/ }).getByRole("radio", { name: "Not OK" }).click();
  await expect(dialog.getByText("Needs attention", { exact: true })).toBeVisible();
  await dialog.getByLabel(/What to fix: No confidential papers/).fill(note);
  await dialog.getByLabel("Message to the employee").fill(message);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Check saved.")).toBeVisible();
  await expect(card.getByText("Needs attention")).toBeVisible();
  await expect(card.getByText("Not read yet")).toBeVisible();
}

test.describe("a check the employee reads in the app", () => {
  test.use({ storageState: session("it") });

  test("is recorded by IT, shown on the employee's home page, and read there", async ({ page, browser }, info) => {
    const console = watchConsole(page);
    const name = unique(info, "DESK").replace(/\s+/g, "-");
    const note = unique(info, "Payroll printouts on the desk");
    const id = await desktop(page, name);
    await checkFromAssetPage(page, id, "Nora Al-Otaibi", note, "Please clear them by Sunday.");

    const employee = await browser.newContext({ storageState: session("employee") });
    const home = await employee.newPage();
    await home.goto("/en/home");
    const card = home.locator("[data-slot='card']").filter({ hasText: note });
    await expect(card.getByText("Your workstation needs attention")).toBeVisible();
    await expect(card).toContainText("No confidential papers left on the desk");
    await expect(card).toContainText("Please clear them by Sunday.");
    await card.getByRole("button", { name: "I've read it" }).click();
    await expect(home.getByText("Thank you.")).toBeVisible();
    await expect(home.locator("[data-slot='card']").filter({ hasText: note })).toHaveCount(0);
    await employee.close();

    // IT sees it read, in the app, from the list.
    await page.goto("/en/workstation-checks");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Needs attention");
    await expect(row).toContainText(/Read \d/);
    await row.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(page.getByText(/Nora Al-Otaibi, in the app/)).toBeVisible();
    console.assertClean();
  });
});

test.describe("a check shown at Windows sign-in", () => {
  test.use({ storageState: session("admin") });

  test("reaches the script only with a workstation key, and is marked read with its code", async ({ page }, info) => {
    const console = watchConsole(page);
    // A key made for the workstation messages, in Settings → API access.
    await page.goto("/en/settings/api");
    await page.getByLabel("Name").fill(unique(info, "Sign-in script"));
    await page.getByRole("combobox", { name: "Used for" }).click();
    await page.getByRole("option", { name: "Workstation messages" }).click();
    await page.getByRole("button", { name: "Make a key" }).click();
    const key = (await page.getByRole("status").locator("code").textContent())!.trim();
    expect(key).toMatch(/^apit_/);
    await expect(page.getByRole("status")).toContainText("WorkstationMessage.ps1");

    // A shared computer, assigned to no one, checked; whoever signs in to it sees the result.
    const computer = unique(info, "RECEPTION").replace(/\s+/g, "-");
    const id = await desktop(page, computer);
    const checklist = (await (await page.request.get("/api/workstation-checks/checklist")).json()) as { code: string }[];
    const made = await page.request.post("/api/workstation-checks", { data: { assetId: id, items: checklist.map((i) => ({ code: i.code, state: "ok" })), message: "Very tidy, thank you!" } });
    expect(made.ok(), await made.text()).toBe(true);
    const checkId = ((await made.json()) as { id: number }).id;

    const signIn = { upn: "visitor.e2e@applus.local", user: "visitor.e2e", computer: computer.toLowerCase() };
    const ask = (token: string | null) => page.request.post("/api/public/workstation/message", { data: signIn, headers: token ? { authorization: `Bearer ${token}` } : {} });
    // Without a key, or with a made-up one: refused. The key does not read the KPIs either.
    expect((await ask(null)).status()).toBe(401);
    expect((await ask("apit_made-up")).status()).toBe(401);
    expect((await page.request.get("/api/public/kpis", { headers: { authorization: `Bearer ${key}` } })).status()).toBe(401);

    const shown = ((await (await ask(key)).json()) as { message: { id: number; code: string; result: string; message: string; toFix: unknown[] } }).message;
    expect(shown).toMatchObject({ id: checkId, result: "passed", message: "Very tidy, thank you!", toFix: [] });
    const readIt = (code: string) => page.request.post(`/api/public/workstation/message/${checkId}/read`, { data: { ...signIn, code }, headers: { authorization: `Bearer ${key}` } });
    expect((await readIt("x".repeat(32))).status()).toBe(404);
    expect((await readIt(shown.code)).ok()).toBe(true);
    // Read once: not shown again.
    expect(((await (await ask(key)).json()) as { message: unknown }).message).toBeNull();

    await page.goto(`/en/workstation-checks/${checkId}`);
    await expect(page.getByText(`visitor.e2e@applus.local, ${computer.toLowerCase()}`)).toBeVisible();
    console.assertClean();
  });
});

test.describe("PCs seen at sign-in", () => {
  test.use({ storageState: session("admin") });

  test("a renamed PC shows in Asset Discovery, and its asset takes the new name", async ({ page }, info) => {
    const console = watchConsole(page);
    await page.goto("/en/settings/api");
    await page.getByLabel("Name").fill(unique(info, "Sign-in script"));
    await page.getByRole("combobox", { name: "Used for" }).click();
    await page.getByRole("option", { name: "Workstation messages" }).click();
    await page.getByRole("button", { name: "Make a key" }).click();
    const key = (await page.getByRole("status").locator("code").textContent())!.trim();

    const stamp = `${info.workerIndex}${Date.now() % 100_000}`;
    const oldName = `DT-OLD-${stamp}`;
    const newName = `FIN-PC-${stamp}`;
    const res = await page.request.post("/api/assets", {
      data: { name: oldName, serial: `SN-E2E-${stamp}`, category: "end_user", type: "desktop", status: "in_use", location: "jeddah", supportStatus: "supported", criticality: "medium", monitorMethod: "none" },
    });
    expect(res.ok(), await res.text()).toBe(true);
    const assetId = ((await res.json()) as { id: number }).id;

    const signIn = await page.request.post("/api/public/workstation/message", {
      data: { upn: "employee@applus.test", user: "employee", computer: newName, serial: `SN-E2E-${stamp}`, mac: "AA-BB-CC-DD-EE-77" },
      headers: { authorization: `Bearer ${key}` },
    });
    expect(signIn.ok(), await signIn.text()).toBe(true);
    expect(((await signIn.json()) as { device: { computer: string } }).device.computer).toBe(newName);

    await page.goto("/en/assets/discovery");
    const row = page.getByRole("row").filter({ hasText: newName });
    await expect(row).toContainText(oldName);
    await expect(row).toContainText("Name changed");
    await expect(row).toContainText("matched by serial number");
    await row.getByRole("button", { name: `Update ${oldName} from what the PC reported` }).click();
    await expect(page.getByText("Asset updated from the PC's report.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: newName })).toContainText("Matches");

    await page.goto(`/en/assets/${assetId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(newName);
    const card = page.locator("[data-slot='card']").filter({ has: page.locator("[data-slot='card-title']", { hasText: /^Seen at sign-in$/ }) });
    await expect(card).toContainText("employee@applus.test");
    console.assertClean();
  });
});
