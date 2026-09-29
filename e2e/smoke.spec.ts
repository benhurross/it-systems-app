import { expect, test } from "@playwright/test";

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
