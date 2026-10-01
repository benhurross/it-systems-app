import { expect, test } from "@playwright/test";
import { session } from "./env";
import { choose, signedOut, signIn, unique, watchConsole } from "./helpers";

test.describe("as an admin", () => {
  test.use({ storageState: session("admin") });

  test("Settings is in the sidebar and opens on Users", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/en\/settings\/users$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "admin@applus.test" })).toBeVisible();
    console.assertClean();
  });

  test("a new user can sign in, and cannot once deactivated", async ({ page, browser }, info) => {
    const name = unique(info, "E2E Technician");
    const email = `e2e.${info.project.name}.${Date.now()}@applus.test`;
    const password = "E2E-Temporary-1";

    await page.goto("/en/settings/users");
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await choose(page, "Role", "IT staff");
    await dialog.getByLabel("Temporary password").fill(password);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();

    // The new account signs in and has no Settings.
    const context = await signedOut(browser);
    const other = await context.newPage();
    await signIn(other, email, password);
    await expect(other.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(other.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await context.close();

    // Deactivate it; signing in is refused.
    await page.getByRole("row", { name: new RegExp(email) }).getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByRole("switch", { name: "Active" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row", { name: new RegExp(email) })).toContainText("Deactivated");

    const blocked = await signedOut(browser);
    const again = await blocked.newPage();
    await signIn(again, email, password);
    await expect(again.getByText("This account has been deactivated.")).toBeVisible();
    await blocked.close();

    // Both changes are in the audit log.
    await page.goto("/en/settings/audit");
    await page.getByRole("textbox", { name: "Filter rows" }).fill(name);
    await expect(page.getByRole("cell", { name: `Added ${name} as it_staff` })).toBeVisible();
    await expect(page.getByRole("cell", { name: `Updated ${name}: deactivated` })).toBeVisible();
  });

  test("choosing an employee record fills in the new user's name and email", async ({ page }, info) => {
    const [person] = (await (await page.request.get("/api/employees")).json()) as { name: string; email: string }[];
    // Someone from the staff list with no email on record has a placeholder address.
    const unrecorded = unique(info, "No Mail");
    const res = await page.request.post("/api/employees", {
      data: {
        name: unrecorded,
        email: `no.mail.${info.project.name}.${Date.now()}@no-email.invalid`,
        department: "operations",
        location: "jeddah",
        jobTitle: "Employee",
        phone: null,
        active: true,
      },
    });
    expect(res.ok()).toBe(true);

    await page.goto("/en/settings/users");
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog");
    await choose(page, "Employee record", `${person.name} (${person.email})`);
    await expect(dialog.getByLabel("Full name")).toHaveValue(person.name);
    await expect(dialog.getByLabel("Email")).toHaveValue(person.email);

    // The placeholder is not filled in; the admin is asked for the real address instead.
    await choose(page, "Employee record", new RegExp(unrecorded));
    await expect(dialog.getByLabel("Full name")).toHaveValue(unrecorded);
    await expect(dialog.getByLabel("Email")).toHaveValue("");
    await expect(dialog.getByText("This person has no email on record.", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog).toBeVisible();
  });

  test("a new list value is saved, survives a reload, reaches the forms and is in the audit log", async ({ page }, info) => {
    const label = unique(info, "Branch");
    const code = `branch_${info.project.name}_${Date.now() % 100_000}`;
    await page.goto("/en/settings/lists");
    await page.getByRole("button", { name: "Add value" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code").fill(code);
    await dialog.getByLabel("English label").fill(label);
    await dialog.getByLabel("Arabic label").fill("فرع");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: label })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("cell", { name: label })).toBeVisible();

    // The new location is offered wherever a location is chosen.
    await page.goto("/en/tickets/new");
    await page.getByRole("combobox", { name: "Location" }).click();
    await expect(page.getByRole("option", { name: label })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/en/settings/audit");
    await page.getByRole("textbox", { name: "Filter rows" }).fill(label);
    await expect(page.getByRole("cell", { name: `Added "${label}" to location` })).toBeVisible();
  });

  test("the list code is checked before saving", async ({ page }) => {
    await page.goto("/en/settings/lists");
    await page.getByRole("button", { name: "Add value" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Code").fill("Not Valid");
    await dialog.getByLabel("English label").fill("X");
    await dialog.getByLabel("Arabic label").fill("س");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Use lowercase letters, digits and underscores only.")).toBeVisible();
  });

  test("an admin cannot change their own role", async ({ page }) => {
    await page.goto("/en/settings/users");
    await page.getByRole("row", { name: /admin@applus\.test/ }).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("You cannot change your own role or deactivate yourself.")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Role" })).toHaveCount(0);
    await expect(dialog.getByRole("switch", { name: "Active" })).toHaveCount(0);
  });

  test("the settings forms load their saved values", async ({ page }) => {
    await page.goto("/en/settings/service-desk");
    await expect(page.getByLabel("Critical (Hours)")).toHaveValue("4");
    await page.goto("/en/settings/monitoring");
    await expect(page.getByRole("switch", { name: "Run checks" })).toHaveAttribute("aria-checked", "false");
    await page.goto("/en/settings/kpis");
    await expect(page.getByRole("group", { name: /Tickets resolved within SLA/ }).getByLabel("Target")).toHaveValue("90");
    await page.goto("/en/settings/organisation");
    await expect(page.getByLabel("Organization name")).toHaveValue("AP Plus");
    // A choice from a list loads too (it used to come up empty, and saving failed).
    await page.goto("/en/settings/email");
    await expect(page.getByRole("combobox", { name: "Connection security" })).toHaveText("STARTTLS (usually port 587)");
    await expect(page.getByLabel("Keep sent emails for (days)")).toHaveValue("90");
  });

  test("Settings works in Arabic", async ({ page }) => {
    await page.goto("/ar/settings/users");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
    await expect(page.getByRole("link", { name: "سجل التدقيق" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "فريق تقنية المعلومات" }).first()).toBeVisible();
  });
});

test.describe("as IT staff", () => {
  test.use({ storageState: session("it") });

  test("Settings is hidden and its pages refuse entry", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("link", { name: "Tickets", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await page.goto("/en/settings/users");
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
    expect((await page.request.get("/api/settings/users")).status()).toBe(403);
    expect((await page.request.get("/api/audit")).status()).toBe(403);
  });
});

test.describe("as an employee", () => {
  test.use({ storageState: session("employee") });

  test("the dashboard and Settings are out of reach", async ({ page }) => {
    await page.goto("/en");
    await expect(page).toHaveURL(/\/en\/home$/);
    await expect(page.getByRole("link", { name: "My requests" })).toBeVisible();
    await page.goto("/en/settings/lists");
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
    expect((await page.request.get("/api/assets")).status()).toBe(403);
  });
});
