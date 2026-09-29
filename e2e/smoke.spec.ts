import { expect, test } from "@playwright/test";

test("home page renders the brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AP Plus IT Systems" })).toBeVisible();
  await expect(page.getByRole("img", { name: "AP Plus" })).toBeVisible();
});
