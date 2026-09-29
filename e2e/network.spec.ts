import { expect, test, type TestInfo } from "@playwright/test";
import { session } from "./env";
import { addTcpDevice, listen, unique, watchConsole } from "./helpers";

/** Browsers run side by side on one database, so each ticks its own checklist item. */
const slot = (info: TestInfo) => ["chromium", "firefox", "webkit"].indexOf(info.project.name);

test.describe("IT staff", () => {
  test.use({ storageState: session("it") });

  test("a device that stops answering raises an alert, which becomes a ticket", async ({ page }, info) => {
    const console = watchConsole(page);
    const name = unique(info, "APP-SRV");
    const { port, close } = await listen();
    await addTcpDevice(page, name, port);

    await page.goto("/en/network/status");
    await expect(page.getByText("An administrator can turn them on in Settings.")).toBeVisible();
    await page.getByRole("textbox", { name: "Filter rows" }).fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Unknown");

    const check = async () => {
      const response = page.waitForResponse((r) => r.url().endsWith("/check") && r.request().method() === "POST");
      await row.getByRole("button", { name: `Check ${name} now` }).click();
      return ((await (await response).json()) as { status: string }).status;
    };
    expect(await check()).toBe("up");
    await expect(row).toContainText("Up");

    await close();
    expect(await check()).toBe("up"); // one missed check is not an outage
    expect(await check()).toBe("down");
    await expect(row).toContainText("Down");

    const alert = page.getByRole("list", { name: "Alerts" }).getByRole("listitem").filter({ hasText: name });
    await alert.getByRole("button", { name: "Acknowledge" }).click();
    await expect(alert).toContainText("Acknowledged by Omar Haddad");
    await alert.getByRole("button", { name: "Create ticket" }).click();
    await expect(page).toHaveURL(/\/en\/tickets\/\d+$/);
    await expect(page.getByRole("heading", { name: `${name} is down` })).toBeVisible();
    console.assertClean();
  });

  test("ticks a daily check and keeps its note", async ({ page }, info) => {
    const item = ["Wi-Fi access points", "Printers", "Test email sent and received"][slot(info)];
    const note = `Checked in ${info.project.name}`;
    await page.goto("/en/network/daily");
    const box = page.getByRole("checkbox", { name: item });
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toBeChecked();
    await expect(page.getByRole("listitem").filter({ has: box })).toContainText("Omar Haddad at");
    const field = page.getByRole("textbox", { name: `Note for ${item}` });
    await field.fill(note);
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/daily-checks") && r.request().method() === "PUT");
    await field.blur();
    await saved;

    await page.reload();
    await expect(page.getByRole("checkbox", { name: item })).toBeChecked();
    await expect(page.getByRole("textbox", { name: `Note for ${item}` })).toHaveValue(note);
  });
});

test.describe("admins", () => {
  test.use({ storageState: session("admin") });

  test("are pointed to Settings while checks are paused", async ({ page }) => {
    await page.goto("/en/network");
    await expect(page).toHaveURL(/\/en\/network\/status$/);
    await page.getByRole("link", { name: "Turn them on in Settings" }).click();
    await expect(page).toHaveURL(/\/en\/settings\/monitoring$/);
  });
});
