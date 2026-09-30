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
  await expect(sheet.getByText("11/11")).toBeVisible();
  await complete.click();
  await expect(page.getByText(`Onboarding complete. ${name} is now in the directory.`)).toBeVisible();
  await sheet.getByRole("link", { name: "View in the directory" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
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
