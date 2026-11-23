import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

/** Browsers run side by side, so each offboards a different person. */
const leaver = (info: TestInfo) => ["Ahmed Farouk", "Ahmed Kareem", "Ali Nasser"][["chromium", "firefox", "webkit"].indexOf(info.project.name)];

test.use({ storageState: session("it") });

test("completing a joiner's checklist adds them to the directory", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Yara Joiner");
  const email = `yara.${info.project.name}.${Date.now()}@applus.test`;
  await page.goto("/en/people/onboarding");
  await page.getByRole("button", { name: "New joiner" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Job title").fill("Claims Officer");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Start date").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  await dialog.getByLabel("Mobile").fill("+966 50 765 4321");
  await choose(page, "Department", "Operations");
  await choose(page, "Location", "Jeddah Head Office");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: `Onboarding: ${name}` });
  const complete = sheet.getByRole("button", { name: "Complete onboarding" });
  await expect(complete).toBeDisabled();
  for (const box of await sheet.getByRole("checkbox").all()) {
    await box.click();
    await expect(box).toBeChecked();
  }
  await expect(sheet.getByText("12/12")).toBeVisible();
  await complete.click();
  await expect(page.getByText(`Onboarding complete. ${name} is now in the directory.`)).toBeVisible();
  await sheet.getByRole("link", { name: "View in the directory" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  // The mobile number given at onboarding came along.
  await expect(page.getByRole("link", { name: /\+966 50 765 4321/ })).toBeVisible();
  console.assertClean();
});

test("adding someone to the directory who is being onboarded points to their onboarding", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Omar Joining");
  const email = `omar.${info.project.name}.${Date.now()}@applus.test`;
  const made = await page.request.post("/api/joiners", {
    data: { name, email, department: "sales", location: "jeddah", jobTitle: "Account Manager", employeeNumber: null, phone: null, mobile: null, startDate: "2026-12-01" },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const id = ((await made.json()) as { id: number }).id;

  await page.goto("/en/people/directory");
  await page.getByRole("button", { name: "Add employee" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("someone.else@applus.test");
  await expect(dialog.getByText(`${name} is being onboarded`)).toBeHidden();
  // Typed differently, it is still the same person.
  await dialog.getByLabel("Email").fill(email.toUpperCase());
  await expect(dialog.getByText(`${name} is being onboarded`)).toBeVisible();
  await dialog.getByRole("link", { name: "Open their onboarding" }).click();
  await expect(page).toHaveURL(new RegExp(`/en/people/onboarding\\?open=${id}$`));
  await expect(page.getByRole("dialog", { name: `Onboarding: ${name}` })).toBeVisible();
  console.assertClean();
});

test("offboarding counts down mail forwarding and marks the person as left", async ({ page }, info) => {
  const person = leaver(info);
  await page.goto("/en/people/offboarding");
  await page.getByRole("button", { name: "New leaver" }).click();
  // By name: the employee picker's pop-over is a dialog too, and can still be closing.
  const dialog = page.getByRole("dialog", { name: "New leaver" });
  await dialog.getByRole("combobox", { name: "Employee" }).click();
  await page.getByPlaceholder("Search").fill(person);
  await page.getByRole("option", { name: new RegExp(`^${person} `) }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: person });
  await expect(row).toContainText("Days left: 90");
  await expect(row).toContainText("Forwarding mail");
  await row.getByRole("button", { name: person }).click();
  const sheet = page.getByRole("dialog", { name: `Offboarding: ${person}` });
  for (const box of await sheet.getByRole("checkbox").all()) {
    await box.click();
    await expect(box).toBeChecked();
  }
  await expect(sheet.getByText("Completed")).toBeVisible();
  // The panel hides the page from assistive technology, so close it before reading the table.
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Completed");

  await page.getByRole("link", { name: "Directory" }).click();
  await expect(page).toHaveURL(/\/people\/directory$/);
  await page.getByRole("textbox", { name: "Filter rows" }).fill(person);
  await expect(page.getByRole("row").filter({ hasText: person })).toContainText("Left");
});

test("a directory profile shows the devices held and the tickets raised", async ({ page }) => {
  await page.goto("/en/people/directory");
  await page.getByRole("textbox", { name: "Filter rows" }).fill("Nora Al-Otaibi");
  await page.getByRole("link", { name: "Nora Al-Otaibi" }).click();
  await expect(page.getByRole("heading", { name: "Nora Al-Otaibi" })).toBeVisible();
  await expect(page.getByText(/^Assets held \(\d+\)$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^LT-\d+/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^IT\d{6}/ }).first()).toBeVisible();
});

test("ID numbers show in the directory, are edited there, and one held twice is flagged", async ({ page }, info) => {
  const number = `9${Date.now() % 100_000}${info.workerIndex}`;
  const person = (label: string) => ({
    name: unique(info, label),
    email: `${label.toLowerCase()}.${info.project.name}.${Date.now()}@applus.test`,
    department: "sales",
    location: "jeddah",
    jobTitle: "Account Manager",
    employeeNumber: null,
    phone: null,
    active: true,
  });
  const first = person("Numbered");
  const second = { ...person("Twin"), employeeNumber: number };
  for (const p of [first, second]) expect((await page.request.post("/api/employees", { data: p })).ok()).toBe(true);

  await page.goto("/en/people/directory");
  await page.getByRole("textbox", { name: "Filter rows" }).fill(first.name);
  await page.getByRole("row").filter({ hasText: first.name }).getByRole("link", { name: first.name }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("ID number").fill(number);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`ID: ${number}`)).toBeVisible();

  await page.goto("/en/people/directory");
  await page.getByRole("textbox", { name: "Filter rows" }).fill(number);
  const rows = page.getByRole("row").filter({ hasText: number });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Duplicate");
  await expect(rows.last()).toContainText("Duplicate");
});

test("the directory's search and filters are still there after opening someone and going Back", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/people/directory");
  await page.getByRole("textbox", { name: "Filter rows" }).fill("Nora");
  await page.getByRole("button", { name: "Department" }).first().click();
  await page.getByRole("menuitemcheckbox", { name: /Finance/ }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/q=Nora/);
  await expect(page).toHaveURL(/f\.department=finance/);
  await page.getByRole("link", { name: "Nora Al-Otaibi" }).click();
  await expect(page.getByRole("heading", { name: "Nora Al-Otaibi" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Filter rows" })).toHaveValue("Nora");
  await expect(page.getByRole("button", { name: "Department" }).first()).toContainText("1");
  await expect(page.getByRole("link", { name: "Nora Al-Otaibi" })).toBeVisible();
  // And after a reload.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Filter rows" })).toHaveValue("Nora");
  // Cleared, the address is plain again.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/q=|f\./);
  console.assertClean();
});

test("an employee's mobile number is added, checked, and shown in the directory", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Mobile Person");
  const made = await page.request.post("/api/employees", {
    data: { name, email: `mobile.${info.project.name}.${Date.now()}@applus.test`, department: "sales", location: "jeddah", jobTitle: "Account Manager", employeeNumber: null, phone: null, active: true },
  });
  expect(made.ok(), await made.text()).toBe(true);
  const id = ((await made.json()) as { id: number }).id;
  await page.goto(`/en/people/directory/${id}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mobile").fill("12ab");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText(/Enter a mobile number/)).toBeVisible();
  await dialog.getByLabel("Mobile").fill("+966 55 123 4567");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: /\+966 55 123 4567/ })).toHaveAttribute("href", "tel:+966551234567");
  await page.goto(`/en/people/directory?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("+966 55 123 4567");
  console.assertClean();
});

test.describe("deleting offboarding records", () => {
  test.use({ storageState: session("admin") });

  test("an Admin chooses a run of them with Shift and deletes them together, after a confirmation", async ({ page }, info) => {
    const console = watchConsole(page);
    const prefix = unique(info, "Gone Person");
    // Three people leaving, resigned a day apart so the list (newest first) shows them in order 3, 2, 1.
    for (const n of [1, 2, 3]) {
      const made = await page.request.post("/api/employees", {
        data: { name: `${prefix} ${n}`, email: `gone.${n}.${info.project.name}.${Date.now()}@applus.test`, department: "sales", location: "jeddah", jobTitle: "Account Manager", employeeNumber: null, phone: null, active: true },
      });
      expect(made.ok(), await made.text()).toBe(true);
      const id = ((await made.json()) as { id: number }).id;
      const leaving = await page.request.post("/api/leavers", { data: { employeeId: id, resignationDate: `2026-10-0${n}`, forwardTo: null, notes: null } });
      expect(leaving.ok(), await leaving.text()).toBe(true);
    }

    await page.goto(`/en/people/offboarding?q=${encodeURIComponent(prefix)}`);
    const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(rows).toHaveCount(3);
    await page.getByRole("checkbox", { name: `Select ${prefix} 3` }).click();
    await page.getByRole("checkbox", { name: `Select ${prefix} 1` }).click({ modifiers: ["Shift"] });
    for (const n of [1, 2, 3]) await expect(page.getByRole("checkbox", { name: `Select ${prefix} ${n}` })).toBeChecked();

    await page.getByRole("button", { name: "Delete selected (3)" }).click();
    const ask = page.getByRole("alertdialog", { name: "Delete these 3 offboarding records?" });
    for (const n of [1, 2, 3]) await expect(ask.getByRole("listitem").filter({ hasText: `${prefix} ${n}` })).toBeVisible();
    const remove = ask.getByRole("button", { name: "Delete" });
    await expect(remove).toBeDisabled();
    await ask.getByLabel("I have checked: delete these 3 records.").check();
    await remove.click();
    await expect(page.getByText("3 offboarding records deleted.")).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("No rows match the filters");
    console.assertClean();
  });

  test("an IT Admin has no way to delete them, and the server refuses", async ({ browser }) => {
    const context = await browser.newContext({ storageState: session("itAdmin") });
    const page = await context.newPage();
    await page.goto("/en/people/offboarding");
    await expect(page.getByRole("row").filter({ has: page.getByRole("cell") }).first()).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
    await expect(page.getByText("hold Shift", { exact: false })).toHaveCount(0);
    const [first] = (await (await page.request.get("/api/leavers")).json()) as { id: number }[];
    expect((await page.request.post("/api/leavers/delete", { data: { ids: [first.id] } })).status()).toBe(403);
    await context.close();
  });
});
