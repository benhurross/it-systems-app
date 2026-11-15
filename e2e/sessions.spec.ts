import { expect, test, type Browser, type Page } from "@playwright/test";
import { session } from "./env";
import { signedOut, signIn, unique, watchConsole } from "./helpers";

// Where an account is signed in, signing out elsewhere, and signing out after a time without
// activity. Each test signs in an account of its own, so other tests' sign-ins are never ended.

test.use({ storageState: session("admin") });

const PASSWORD = "Sessions-Test-Pass-1";

/** A new IT staff account, made by the admin: its email. */
async function newAccount(page: Page, label: string) {
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@applus.test`;
  const res = await page.request.post("/api/settings/users", { data: { name: label, email, password: PASSWORD, role: "it_staff", employeeId: null } });
  expect(res.ok(), await res.text()).toBe(true);
  return { email, id: ((await res.json()) as { id: string }).id };
}

async function signedInAs(browser: Browser, email: string) {
  const context = await signedOut(browser);
  const page = await context.newPage();
  await signIn(page, email, PASSWORD);
  await expect(page).not.toHaveURL(/sign-in/);
  return { context, page };
}

test("each person sees where they are signed in, and signs out everywhere else; an admin sees an account's", async ({ page, browser }, info) => {
  const account = await newAccount(page, unique(info, "Two Places"));
  const first = await signedInAs(browser, account.email);
  const second = await signedInAs(browser, account.email);
  const console = watchConsole(first.page);

  await first.page.getByRole("button", { name: /Two Places/ }).click();
  await first.page.getByRole("menuitem", { name: "Where I'm signed in" }).click();
  const dialog = first.page.getByRole("dialog", { name: "Where you are signed in" });
  await expect(dialog.locator("[data-session]")).toHaveCount(2);
  await expect(dialog.locator("[data-session='current']")).toContainText("This one");

  // The admin sees the same two, from Settings → Users.
  await page.goto("/en/settings/users");
  await page.getByRole("row", { name: new RegExp(account.email) }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog").locator("[data-session]")).toHaveCount(2);
  await page.keyboard.press("Escape");

  await dialog.getByRole("button", { name: "Sign out everywhere else" }).click();
  await expect(first.page.getByText("Signed out everywhere else.")).toBeVisible();
  await expect(dialog.locator("[data-session]")).toHaveCount(1);
  // The other browser is signed out: its next request is refused.
  expect((await second.page.request.get("/api/me/sessions")).status()).toBe(401);
  console.assertClean();

  // The admin signs the account out everywhere.
  await page.getByRole("row", { name: new RegExp(account.email) }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page.getByText("Signed out everywhere.")).toBeVisible();
  expect((await first.page.request.get("/api/me/sessions")).status()).toBe(401);
  await first.context.close();
  await second.context.close();
});

test("a new password signs the account out everywhere", async ({ page, browser }, info) => {
  const account = await newAccount(page, unique(info, "Reset Me"));
  const them = await signedInAs(browser, account.email);
  expect((await page.request.patch(`/api/settings/users/${account.id}`, { data: { password: "Completely-New-Pass-2" } })).ok()).toBe(true);
  expect((await them.page.request.get("/api/me/sessions")).status()).toBe(401);
  await them.context.close();
});

test("after a time without activity, a warning, then signed out, back to where one was", async ({ page, browser }, info) => {
  const account = await newAccount(page, unique(info, "Idle Person"));
  const context = await signedOut(browser);
  const idle = await context.newPage();
  await signIn(idle, account.email, PASSWORD);
  await expect(idle).not.toHaveURL(/sign-in/);
  // Five minutes, as Settings start with (the test server itself keeps the rules off), on a clock run fast.
  await idle.route("**/api/me/active", (route) => route.fulfill({ json: { idleMinutes: 5 } }));
  await idle.clock.install();
  // The dashboard, which updates itself: that is not activity.
  await idle.goto("/en/");
  await expect(idle.getByRole("heading", { level: 1 })).toBeVisible();

  await idle.clock.runFor(4 * 60_000 + 5_000);
  const warning = idle.locator("[data-idle-warning]");
  await expect(warning).toContainText("Still there?");
  await expect(warning).toContainText("signed out in");
  await warning.getByRole("button", { name: "Stay signed in" }).click();
  await expect(warning).toBeHidden();

  // Left alone again: signed out at five minutes, told why, and sent back to the page after.
  await idle.clock.runFor(5 * 60_000 + 5_000);
  await expect(idle).toHaveURL(/\/en\/sign-in\?reason=idle&next=%2F$/);
  await expect(idle.getByRole("status")).toContainText("You were signed out after a time without activity.");
  expect((await idle.request.get("/api/me/sessions")).status()).toBe(401);
  await context.close();
});

test("the sign-in rules are set in Settings → Users", async ({ page }) => {
  await page.goto("/en/settings/users");
  const card = page.locator("[data-sign-in-rules]");
  await expect(card.getByRole("switch", { name: "One sign-in at a time per account" })).toBeChecked();
  await expect(card.getByRole("combobox", { name: "Sign out after no activity" })).toHaveText("5 minutes");
  await card.getByRole("combobox", { name: "Sign out after no activity" }).click();
  await page.getByRole("option", { name: "15 minutes" }).click();
  await expect(page.getByText("Sign-in settings saved.")).toBeVisible();
  await expect(card.getByRole("combobox", { name: "Sign out after no activity" })).toHaveText("15 minutes");
  // Back as it was.
  expect((await page.request.put("/api/settings/security", { data: { singleSession: true, idleMinutes: 5 } })).ok()).toBe(true);
});
