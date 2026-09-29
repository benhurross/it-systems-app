import { expect, test } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

test.use({ storageState: session("it") });

test("plan a project and move its tasks across the board", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Printer fleet refresh");
  await page.goto("/en/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project").fill(name);
  await choose(page, "Owner", "Omar Haddad");
  await choose(page, "Status", "Active");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/en\/projects\/\d+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  for (const title of ["Order toner stock", "Replace the HR printer"]) {
    await page.getByRole("button", { name: "Add task" }).click();
    await dialog.getByLabel("Task").fill(title);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Tasks done: 0 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Move Order toner stock to In progress" }).click();
  await expect(page.getByRole("group", { name: /In progress/ })).toContainText("Order toner stock");
  await page.getByRole("button", { name: "Move Order toner stock to Done" }).click();
  await expect(page.getByRole("group", { name: /Done/ })).toContainText("Order toner stock");
  await expect(page.getByText("Tasks done: 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Delete Replace the HR printer" }).click();
  await expect(page.getByText("Tasks done: 1 of 1")).toBeVisible();

  await page.getByRole("link", { name: "All projects" }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("1/1");
  console.assertClean();
});
