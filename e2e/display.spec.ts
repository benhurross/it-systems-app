import { expect, test, type Page } from "@playwright/test";
import { session } from "./env";
import { watchConsole } from "./helpers";

test.use({ storageState: session("it") });

const html = (page: Page) => page.locator("html");
const rootFontSize = (page: Page) => page.evaluate(() => document.documentElement.style.fontSize);

test("the command menu opens with Ctrl+K, goes to a page and runs an action", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const menu = page.getByRole("dialog");
  await menu.getByPlaceholder("Search pages and actions").fill("Knowledge");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/knowledge$/);
  await expect(menu).toBeHidden();

  await page.keyboard.press("ControlOrMeta+k");
  await menu.getByPlaceholder("Search pages and actions").fill("dark theme");
  await menu.getByRole("option", { name: "Use the dark theme" }).click();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  console.assertClean();
});

test("switching language keeps the page and turns it right to left, and back", async ({ page }) => {
  await page.goto("/en/tickets");
  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page).toHaveURL(/\/ar\/tickets$/);
  await expect(html(page)).toHaveAttribute("dir", "rtl");
  await expect(html(page)).toHaveAttribute("lang", "ar");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/tickets$/);
  await expect(html(page)).toHaveAttribute("dir", "ltr");
});

test("the theme follows the choice or the system, and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/en");
  // System is the default: it follows the device.
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveClass(/\bdark\b/);

  const display = page.getByRole("button", { name: "Display" });
  await display.click();
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  await display.click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);

  await display.click();
  await page.getByRole("radio", { name: "System" }).click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
});

test("each text size step changes the root font size, and the choice survives a reload", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const display = page.getByRole("button", { name: "Display" });
  await display.click();
  const larger = page.getByRole("button", { name: "Larger text" });
  for (const size of ["112.5%", "125%", "137.5%"]) {
    await larger.click();
    expect(await rootFontSize(page)).toBe(size);
  }
  await expect(larger).toBeDisabled();

  await page.reload();
  expect(await rootFontSize(page)).toBe("137.5%");

  await display.click();
  await page.getByRole("button", { name: "Reset" }).click();
  expect(await rootFontSize(page)).toBe("100%");
  await page.getByRole("button", { name: "Smaller text" }).click();
  expect(await rootFontSize(page)).toBe("87.5%");
  await expect(page.getByRole("button", { name: "Smaller text" })).toBeDisabled();
  await page.reload();
  expect(await rootFontSize(page)).toBe("87.5%");
});
