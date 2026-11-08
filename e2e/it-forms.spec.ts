import { expect, test } from "@playwright/test";
import { session } from "./env";
import { watchConsole } from "./helpers";

// IT fills in a paper form in the app, the employee's details coming from the directory, and the
// sheet shows what was written, ready to print and sign by hand.

test.describe("IT forms", () => {
  test.use({ storageState: session("it") });

  test("an incident / repair form is filled from the directory and shown on its sheet", async ({ page }) => {
    const console = watchConsole(page);
    await page.goto("/en/it-forms");
    await page.getByRole("button", { name: "New form" }).click();
    await page.getByRole("menuitem", { name: /IT Incident \/ Repair Form/ }).click();
    const dialog = page.getByRole("dialog", { name: "IT Incident / Repair Form" });
    await dialog.getByRole("combobox", { name: /Employee/ }).first().click();
    await page.getByRole("option", { name: "Nora Al-Otaibi", exact: true }).click();
    await expect(dialog.getByLabel("Employee Name")).toHaveValue("Nora Al-Otaibi");
    await expect(dialog.getByLabel("Email")).toHaveValue("employee@applus.test");
    await dialog.getByRole("checkbox", { name: "Incident Report" }).click();
    await dialog.getByRole("radiogroup", { name: "Severity Level:", exact: true }).getByRole("radio", { name: "High" }).click();
    await dialog.getByLabel("Incident Description").fill("Spark sound from the power extension");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/en\/it-forms\/\d+$/);
    const sheet = page.locator(".it-form-sheet");
    await expect(sheet).toContainText("APPLUS/IT/03");
    await expect(sheet).toContainText("Nora Al-Otaibi");
    await expect(sheet).toContainText("Spark sound from the power extension");
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();

    // Corrected from its page.
    await page.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: /Edit: IT Incident/ });
    await edit.getByLabel("Remarks").fill("Purchased more than five years ago");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await expect(sheet).toContainText("Purchased more than five years ago");
    console.assertClean();
  });

  test("each form draws on one A4 sheet, and the list and profile show them", async ({ page }) => {
    const console = watchConsole(page);
    const nora = ((await (await page.request.get("/api/employees")).json()) as { id: number; name: string }[]).find((e) => e.name === "Nora Al-Otaibi")!;
    for (const [kind, formatNo, text] of [
      ["it_request", "APPLUS/IT/05", "OASIS Access Request"],
      ["credentials", "APPLUS/ITM/12", "EMPLOYEE CREDENTIAL INFORMATION"],
      ["maintenance", "APPLUS/ITM/08", "SCHEDULED MAINTENANCE REPORT"],
    ] as const) {
      const res = await page.request.post("/api/it-forms", { data: { kind, employeeId: nora.id, data: { person: { name: nora.name } } } });
      expect(res.ok(), await res.text()).toBe(true);
      const { id } = (await res.json()) as { id: number };
      await page.goto(`/en/it-forms/${id}`);
      const sheet = page.locator(".it-form-sheet");
      await expect(sheet).toContainText(formatNo);
      await expect(sheet).toContainText(text);
      // Everything fits the page: nothing is cut off at its foot.
      expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    }
    await page.goto(`/en/people/directory/${nora.id}`);
    const card = page.locator("[data-slot='card']").filter({ has: page.locator("[data-slot='card-title']", { hasText: /^IT forms$/ }) });
    await expect(card.getByRole("link", { name: "Scheduled Maintenance Report" }).first()).toBeVisible();
    console.assertClean();
  });

  test("a privilege the form does not list is refused", async ({ page }) => {
    const res = await page.request.post("/api/it-forms", { data: { kind: "it_request", data: { oasis: { privileges: ["system.everything"] } } } });
    expect(res.status()).toBe(400);
  });
});

test.describe("IT forms, for staff outside IT", () => {
  test.use({ storageState: session("employee") });

  test("are not open to them", async ({ page }) => {
    expect((await page.request.get("/api/it-forms")).status()).toBe(403);
  });
});
