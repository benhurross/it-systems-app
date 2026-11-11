import { expect, test } from "@playwright/test";
import { session } from "./env";
import { watchConsole } from "./helpers";

// An IT Admin has everything an Admin has but the audit log, Team Management and Admin accounts.

test.describe("an IT Admin", () => {
  test.use({ storageState: session("itAdmin") });

  test("has Settings and its users, but not the audit log or the Admins' accounts", async ({ page }) => {
    await page.goto("/en/settings/users");
    await expect(page.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lists" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);

    // The Admins' accounts are not listed, nor the Admin role, in the table, its filter or the form.
    await expect(page.getByRole("row").filter({ hasText: "it@applus.test" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "admin@applus.test" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Admin", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Role", expanded: false }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: /^IT Admin/ })).toBeVisible();
    await expect(page.getByRole("menuitemcheckbox", { name: /^Admin/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add user" }).click();
    await page.getByRole("dialog").getByRole("combobox", { name: "Role" }).click();
    await expect(page.getByRole("option", { name: "IT Admin" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Admin", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The audit log, by its address or its API: refused.
    expect((await page.request.get("/api/audit")).status()).toBe(403);
    await page.goto("/en/settings/audit");
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  });

  test("cannot make anyone an Admin through the API", async ({ page, browser }) => {
    const users = (await (await page.request.get("/api/settings/users")).json()) as { id: string; email: string; role: string }[];
    expect(users.some((u) => u.role === "admin")).toBe(false);
    const helpdesk = users.find((u) => u.email === "it@applus.test")!;
    expect((await page.request.patch(`/api/settings/users/${helpdesk.id}`, { data: { role: "admin" } })).status()).toBe(403);
    // An Admin's account, by its id (seen by an Admin): not there for them.
    const admin = await browser.newContext({ storageState: session("admin") });
    const all = (await (await admin.request.get("/api/settings/users")).json()) as { id: string; email: string }[];
    const boss = all.find((u) => u.email === "admin@applus.test")!;
    await admin.close();
    expect((await page.request.patch(`/api/settings/users/${boss.id}`, { data: { active: false } })).status()).toBe(404);
  });
});

test.describe("an Admin", () => {
  test.use({ storageState: session("admin") });

  test("has the audit log", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en/settings/audit");
    await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();
    expect((await page.request.get("/api/audit")).ok()).toBe(true);
    console.assertClean();
  });
});
