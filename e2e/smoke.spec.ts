import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD } from "../src/server/seed/demo-data";
import { ACCOUNTS, PORT } from "./env";

test("a signed-out visitor is sent to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the Arabic sign-in page is right to left", async ({ page }) => {
  await page.goto("/ar/tickets");
  await expect(page).toHaveURL(/\/ar\/sign-in$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
});

test("reports no session to a signed-out visitor", async ({ request }) => {
  const res = await request.get("/api/auth/get-session");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toBeNull();
});

test("a sign-in from an address the server does not trust says so, rather than blaming the password", async ({ page }) => {
  // The server trusts http://localhost; the same app opened at 127.0.0.1 stands in for a colleague's computer.
  await page.goto(`http://127.0.0.1:${PORT}/en/sign-in`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(ACCOUNTS.it);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(`Ask your administrator to add http://127.0.0.1:${PORT}`)).toBeVisible();
  await expect(page.getByText("Email or password is incorrect.")).toBeHidden();
});
