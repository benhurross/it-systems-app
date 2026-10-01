import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { DEMO_PASSWORD } from "../src/server/seed/demo-data";
import { BASE_URL, session } from "./env";
import { choose, png, signedOut, unique, watchConsole } from "./helpers";

// Browsers run side by side and a person has one card request at a time, so each browser asks
// as a different person, and starts cards for different people.
const BROWSERS = ["chromium", "firefox", "webkit"];
const asker = (info: TestInfo) =>
  [
    { email: "employee@applus.test", name: "Nora Al-Otaibi" },
    { email: "it2@applus.test", name: "Faisal Al-Qahtani" },
    { email: "it3@applus.test", name: "Joseph Mathew" },
  ][BROWSERS.indexOf(info.project.name)];
const cardHolder = (info: TestInfo) => ["Rayan Bakr", "Arwa Al-Amri", "Rawan Nasser"][BROWSERS.indexOf(info.project.name)];

const photo = { name: "me.png", mimeType: "image/png", buffer: png(900, 1200) };

async function signedInAs(browser: Browser, email: string) {
  const context = await signedOut(browser);
  const res = await context.request.post("/api/auth/sign-in/email", { data: { email, password: DEMO_PASSWORD }, headers: { origin: BASE_URL } });
  expect(res.ok()).toBe(true);
  return context.newPage();
}

type Card = { id: number; personName: string; status: string };

/** Removes cards still waiting for a person, left by an earlier attempt, so this one starts clean. */
async function clearWaiting(page: Page, name: string) {
  const cards = (await (await page.request.get("/api/id-cards")).json()) as Card[];
  for (const card of cards.filter((c) => c.personName === name && c.status === "requested")) {
    expect((await page.request.delete(`/api/id-cards/${card.id}`)).ok()).toBe(true);
  }
}

/** Both sides open as one card-sized PDF page each. */
async function expectPdfs(page: Page) {
  for (const name of ["Print front", "Print back"]) {
    const href = await page.getByRole("link", { name }).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const pdf = await PDFDocument.load(await res.body());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 153, height: 243 });
  }
}

test.use({ storageState: session("it") });

test("an employee asks for a new ID card with their photo, and IT prints it", async ({ page, browser }, info) => {
  const console = watchConsole(page);
  const person = asker(info);
  await clearWaiting(page, person.name);

  // The employee places their photo on the card, which already carries their details.
  const employee = await signedInAs(browser, person.email);
  const employeeConsole = watchConsole(employee);
  await employee.goto("/en/home");
  await employee.getByRole("link", { name: "New ID card" }).click();
  await expect(employee.getByRole("heading", { name: "New ID card" })).toBeVisible();
  await expect(employee.getByRole("img", { name: `Front of the ID card for ${person.name}` })).toBeVisible();
  await employee.getByLabel("Your photo").setInputFiles(photo);
  const frame = employee.getByRole("group", { name: "Photo position" });
  const box = (await frame.boundingBox())!;
  await employee.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await employee.mouse.down();
  await employee.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 4 });
  await employee.mouse.up();
  await frame.focus();
  await employee.keyboard.press("ArrowUp");
  await employee.getByRole("button", { name: "Zoom in" }).click();
  await choose(employee, "Reason", "Damaged");
  await employee.getByLabel("Note for IT").fill("The card snapped in half.");
  await employee.getByRole("button", { name: "Send to IT" }).click();
  await expect(employee).toHaveURL(/\/en\/requests\/\d+$/);
  await expect(employee.getByRole("heading", { name: "New ID card (damaged)" })).toBeVisible();
  const ticket = employee.url().split("/").pop();

  // One request at a time: asking again shows the one with IT.
  await employee.goto("/en/requests/id-card");
  await expect(employee.getByText("Your ID card request is with IT")).toBeVisible();
  await employee.goto("/en/home");
  await expect(employee.getByText("New card requested")).toBeVisible();

  // IT opens the card from the ticket, shortens the name, makes it bigger and narrower, and prints.
  await page.goto(`/en/tickets/${ticket}`);
  await page.getByRole("link", { name: "Open the card" }).click();
  await expect(page.getByRole("heading", { name: `ID card for ${person.name}` })).toBeVisible();
  await expect(page.locator("p", { hasText: "Note from" })).toContainText("The card snapped in half.");
  await expect(page.getByText("No photo yet")).toBeHidden();
  const [first, last] = person.name.split(" ");
  const name = page.getByLabel("Name on the card");
  await name.fill(`${first} Abdullah Mohammed ${last}`);
  await page.getByRole("button", { name: "First and last name only" }).click();
  await expect(name).toHaveValue(person.name);
  await page.getByRole("button", { name: "Larger name" }).click();
  await expect(page.getByRole("group", { name: "Size of the name" })).toContainText("8.5 pt");
  await page.getByRole("radiogroup", { name: "Font for the name" }).getByRole("radio", { name: "Narrow" }).click();
  await expect(page.getByText("On the card: Narrow, 8.5 pt").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Print front" })).toBeDisabled();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Card saved.")).toBeVisible();
  await expectPdfs(page);

  await page.getByRole("button", { name: "Mark as printed" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(`tells ${person.name} the card is ready to collect`);
  await confirm.getByRole("button", { name: "Mark as printed" }).click();
  await expect(page.getByText("Card marked as printed.")).toBeVisible();
  await expect(page.getByText(/^Printed .* by Omar Haddad$/)).toBeVisible();

  // Their dashboard shows the card ready to collect, with a preview of both sides.
  await employee.goto("/en/home");
  const myCard = employee.locator('[data-slot="card"]').filter({ has: employee.locator('[data-slot="card-title"]', { hasText: /^Your ID card$/ }) });
  await expect(myCard.getByText("Ready to collect from IT")).toBeVisible();
  await expect(myCard.getByText("Printed and handed over")).toBeHidden();
  await myCard.getByRole("button", { name: "Preview" }).click();
  const preview = employee.getByRole("dialog", { name: "Your ID card" });
  const front = preview.getByRole("img", { name: "Front of your ID card" });
  await expect(front.locator("text").first()).toHaveText(person.name);
  await expect(front.locator('image[href^="/api/id-cards/mine/photo"]')).toHaveCount(1);
  await expect(preview.getByRole("img", { name: "Back of your ID card" })).toBeVisible();
  await employee.keyboard.press("Escape");

  // Once they have it, they confirm on their request, and the card shows as handed over.
  await myCard.getByRole("link", { name: /^request IT\d+$/ }).click();
  await expect(employee.getByText("Your new ID card is printed and ready to collect from IT.")).toBeVisible();
  await expect(employee.getByText("Have you received your ID card?")).toBeVisible();
  await employee.getByRole("button", { name: "Yes, I have it" }).click();
  await expect(employee.getByText("Have you received your ID card?")).toBeHidden();
  await employee.goto("/en/home");
  await expect(myCard.getByText("Printed and handed over")).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${person.name} confirmed they have it`)).toBeVisible();
  await employee.context().close();
  employeeConsole.assertClean();
  console.assertClean();
});

test("IT starts a card from a joiner's checklist, and printing it ticks the step", async ({ page }, info) => {
  const console = watchConsole(page);
  const joinerName = unique(info, "Card Joiner");
  const created = await page.request.post("/api/joiners", {
    data: {
      name: joinerName,
      email: `card.${info.project.name}.${Date.now()}@applus.test`,
      department: "operations",
      location: "jeddah",
      jobTitle: "Claims Officer",
      employeeNumber: "4321",
      startDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    },
  });
  expect(created.ok()).toBe(true);

  await page.goto("/en/people/onboarding");
  await page.getByRole("textbox", { name: "Filter rows" }).fill(joinerName);
  await page.getByRole("button", { name: joinerName, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: `Onboarding: ${joinerName}` });
  await expect(sheet.getByRole("checkbox", { name: "Print the ID card" })).not.toBeChecked();
  await sheet.getByRole("button", { name: "Open card" }).click();
  await expect(page.getByRole("heading", { name: `ID card for ${joinerName}` })).toBeVisible();
  await expect(page.getByRole("img", { name: `Front of the ID card for ${joinerName}` })).toBeVisible();
  await expect(page.getByLabel("ID number")).toHaveValue("4321");
  await expect(page.getByText("No photo yet")).toBeVisible();

  await page.getByRole("button", { name: "Add photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Add photo" });
  await dialog.getByLabel("Your photo").setInputFiles(photo);
  await expect(dialog.getByRole("group", { name: "Photo position" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  await expect(page.getByText("No photo yet")).toBeHidden();
  await expectPdfs(page);

  await page.getByRole("button", { name: "Mark as printed" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as printed" }).click();
  await expect(page.getByText("Card marked as printed.")).toBeVisible();
  // Nobody asked for this card, so IT says when it is handed over.
  await page.getByRole("button", { name: "Mark as handed over" }).click();
  await expect(page.getByText("Card marked as handed over.")).toBeVisible();
  await expect(page.getByText(/^Handed over .* by Omar Haddad$/)).toBeVisible();

  await page.getByRole("link", { name: "Onboarding" }).first().click();
  await page.getByRole("textbox", { name: "Filter rows" }).fill(joinerName);
  await page.getByRole("button", { name: joinerName, exact: true }).click();
  await expect(page.getByRole("dialog", { name: `Onboarding: ${joinerName}` }).getByRole("checkbox", { name: "Print the ID card" })).toBeChecked();
  console.assertClean();
});

test("IT starts a card for someone in the directory, and can delete it", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = cardHolder(info);
  await clearWaiting(page, name);
  await page.goto("/en/people/id-cards");
  await page.getByRole("button", { name: "New ID card" }).click();
  const dialog = page.getByRole("dialog", { name: "New ID card" });
  await dialog.getByRole("combobox", { name: "Employee" }).click();
  await page.getByRole("option", { name: new RegExp(`^${name} \\(`) }).click();
  await choose(page, "Reason", "Lost");
  await dialog.getByRole("button", { name: "Start card" }).click();
  await expect(page.getByRole("heading", { name: `ID card for ${name}` })).toBeVisible();
  await expect(page.getByLabel("Name on the card")).toHaveValue(name);
  await expect(page.getByRole("button", { name: "First and last name only" })).toBeDisabled();

  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Card deleted.")).toBeVisible();
  await expect(page).toHaveURL(/\/en\/people\/id-cards$/);
  console.assertClean();
});
