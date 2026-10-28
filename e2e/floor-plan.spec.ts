import { expect, test } from "@playwright/test";
import { floorPlanPdf } from "../tests/helpers/floor-plan-pdf";
import { floorPlanSvg } from "../tests/helpers/floor-plan-svg";
import { session } from "./env";
import { unique, watchConsole } from "./helpers";

test.use({ storageState: session("it") });
// One after the other: each deletes its plan at the end, which another's page may be showing.
test.describe.configure({ mode: "serial" });

/** A made-up floor with four outlets, one patch panel port given twice and a stray mark on a label. */
const plan = () =>
  floorPlanPdf([
    { p: "P1-1", s: "S1-1", x: 200, y: 200 },
    { p: "P1-2", s: "S1-2", x: 212, y: 200 },
    { p: "P1-2", s: "S2-7", x: 300, y: 450 },
    { p: "P2-3", s: "S2-3`", x: 320, y: 600 },
  ]);

test("a floor plan is read from its PDF, searched, traced and kept up to date", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Floor");
  await page.goto("/en/network/floor-plan");
  await page.getByRole("button", { name: "Upload floor plan" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload floor plan" });

  // Not a PDF: said so, and nothing to save.
  await dialog.getByLabel("Floor plan (PDF or SVG)").setInputFiles({ name: "plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await expect(dialog.getByRole("alert")).toHaveText("That file is not a PDF.");
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await dialog.getByLabel("Floor plan (PDF or SVG)").setInputFiles({ name: "Ground floor.pdf", mimeType: "application/pdf", buffer: Buffer.from(await plan()) });
  await expect(dialog).toContainText("4 outlets found on it.");
  await expect(dialog).toContainText("3 to check after saving:");
  await expect(dialog).toContainText("2 × patch panel port on more than one outlet");
  await expect(dialog).toContainText("1 × label tidied to be read");
  await dialog.getByLabel("Name").fill(name);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/floor-plans") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save" }).click();
  const { id } = (await (await created).json()) as { id: number };
  await expect(page.getByText("Floor plan saved")).toBeVisible();

  const map = page.getByRole("img", { name: `${name}, the floor plan` });
  await expect(map).toBeVisible();
  await expect(page.getByText("4 outlets", { exact: true })).toBeVisible();
  await expect(page.getByText("3 outlets to check")).toBeVisible();

  // Found by its label: the plan zooms to it and says where it goes.
  await page.getByLabel("Find an outlet").fill("S2-7");
  await expect(page.getByText("1 outlet matches")).toBeVisible();
  await page.getByLabel("Find an outlet").press("Enter");
  const card = page.getByRole("complementary").locator("[aria-live]").first();
  await expect(card).toContainText("P1-2 / S2-7");
  await expect(card).toContainText("Panel 1, port 2");
  await expect(card).toContainText("Switch 2, port 7");
  await expect(card).toContainText("Its patch panel port is on another outlet too.");
  await expect(card).toContainText("Which device is this switch?");

  // Corrected by hand: the clash is gone.
  await card.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit outlet P1-2 / S2-7" });
  await edit.getByLabel("Panel port").fill("4");
  await edit.getByLabel("Room or desk").fill("Server room");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Outlet saved")).toBeVisible();
  await expect(card).toContainText("P1-4 / S2-7");
  await expect(card).toContainText("Server room");
  await expect(card).not.toContainText("on another outlet");
  await expect(page.getByText("1 outlet to check")).toBeVisible();

  // Switch 2 is a device in the register: its status shows, and the outlet links to it.
  await page.getByRole("button", { name: "More for this plan" }).click();
  await page.getByRole("menuitem", { name: "Plan and switches" }).click();
  const settings = page.getByRole("dialog", { name: "Plan and switches" });
  await settings.getByRole("combobox", { name: "S2" }).click();
  await page.getByRole("option").nth(1).click();
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();
  await expect(card.getByRole("link")).toBeVisible();
  const switchName = (await card.getByRole("link").textContent())!;
  await expect(page.getByRole("combobox", { name: "Switch" })).toBeVisible();

  // A whole switch: S2 finds both its outlets.
  await page.getByLabel("Find an outlet").fill("S2");
  await expect(page.getByText("2 outlets match")).toBeVisible();
  await page.getByLabel("Find an outlet").fill("");

  // An outlet the drawing does not have, put where it is.
  await page.getByRole("button", { name: "Add outlet" }).click();
  await expect(page.getByText("Click the plan where the outlet is.")).toBeVisible();
  await page.getByRole("button", { name: "Where to put the outlet" }).click({ position: { x: 120, y: 160 } });
  const add = page.getByRole("dialog", { name: "Add outlet" });
  await add.getByLabel("Patch panel").fill("3");
  await add.getByLabel("Panel port").fill("9");
  await add.getByLabel(/^Switch(?! port)/).fill("1");
  await add.getByLabel("Switch port").fill("24");
  await add.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Outlet P3-9 / S1-24" })).toBeVisible();
  await expect(page.getByText("5 outlets", { exact: true })).toBeVisible();

  // The list of what each port serves.
  await page.getByRole("button", { name: "More for this plan" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Export to Excel" }).click()]);
  expect(download.suggestedFilename()).toBe(`${name} outlets.xlsx`);

  // In Arabic.
  await page.goto(`/ar/network/floor-plan?plan=${id}`);
  await expect(page.getByRole("link", { name: "مخطط الطابق" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("البحث عن نقطة شبكة")).toBeVisible();

  // Gone with its outlets.
  await page.goto(`/en/network/floor-plan?plan=${id}`);
  await expect(page.getByRole("img", { name: `${name}, the floor plan` })).toBeVisible();
  await page.getByRole("button", { name: "More for this plan" }).click();
  await page.getByRole("menuitem", { name: "Plan and switches" }).click();
  await page.getByRole("dialog", { name: "Plan and switches" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("5 outlets go with it.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("img", { name: `${name}, the floor plan` })).toBeHidden();
  expect(switchName.length).toBeGreaterThan(0);
  console.assertClean();
});

test("a plan drawn as an SVG is shown in 3D and from above, and its cables traced to the rack", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Floor 3D");
  const svg = floorPlanSvg([
    { p: "P1-1", s: "S1-1", x: 140, y: 200 },
    { p: "P1-2", s: "S1-2", x: 150, y: 200 },
    { p: "P2-3", s: "S2-7", x: 250, y: 300 },
    { p: "P2-4", s: "S2-8", x: 260, y: 300 },
    { p: "P1-5", s: "S1-5", x: 140, y: 260 },
  ]);
  await page.goto("/en/network/floor-plan");
  await page.getByRole("button", { name: "Upload floor plan" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload floor plan" });
  await dialog.getByLabel("Floor plan (PDF or SVG)").setInputFiles({ name: "Office.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await expect(dialog).toContainText("5 outlets found on it.");
  await dialog.getByLabel("Name").fill(name);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/floor-plans") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Save" }).click();
  const { id } = (await (await created).json()) as { id: number };
  await expect(page.getByText("Floor plan saved")).toBeVisible();

  const map = page.getByRole("img", { name: `${name}, the floor plan` });
  await expect(map.locator("canvas")).toBeVisible();
  await expect(page.getByRole("radio", { name: "3D" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Network only" })).toBeChecked();

  // An outlet found: its card, and its cable traced (drawn on the canvas, so the card is what is checked).
  await page.getByLabel("Find an outlet").fill("P2-3");
  await page.getByLabel("Find an outlet").press("Enter");
  const card = page.getByRole("complementary").locator("[aria-live]").first();
  await expect(card).toContainText("Panel 2, port 3");
  await expect(card).toContainText("Switch 2, port 7");
  // Let go with Escape: the card and the cable go.
  await page.locator("body").press("Escape");
  await expect(page.getByText("Panel 2, port 3")).toBeHidden();
  // (Escape in the search box empties it too, as browsers do.)
  await page.getByLabel("Find an outlet").fill("P2-3");
  await page.getByLabel("Find an outlet").press("Enter");
  await expect(card).toContainText("Panel 2, port 3");

  // From above, and a whole patch panel.
  await page.getByRole("radio", { name: "Top view" }).click();
  await expect(page.getByRole("radio", { name: "Top view" })).toHaveAttribute("aria-checked", "true");
  // How to use it, behind the question mark.
  await page.getByRole("button", { name: "How to use the plan" }).hover();
  await expect(page.getByText("Drag to move, the wheel zooms.")).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("Find an outlet").fill("");
  // The rack's units are buttons drawn as the hardware, pressed while shown.
  const p1 = page.getByRole("complementary").getByRole("button", { name: /^P1\b/ });
  await p1.click();
  await expect(p1).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("complementary").getByRole("button", { name: /^S2\b/ }).click();
  await expect(p1).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary").getByRole("button", { name: /^S2\b/ })).toHaveAttribute("aria-pressed", "true");

  // The rack put where it stands: a click on the plan.
  await page.getByRole("button", { name: "Place the rack" }).click();
  await expect(page.getByText("Click the plan where the server rack stands.")).toBeVisible();
  await map.click({ position: { x: 100, y: 100 } });
  await expect(page.getByText("Rack placed")).toBeVisible();

  // The drawing's layers: walls raised, doors flat, and changeable.
  await page.getByRole("button", { name: "More for this plan" }).click();
  await page.getByRole("menuitem", { name: "Plan and switches" }).click();
  const settings = page.getByRole("dialog", { name: "Plan and switches" });
  await expect(settings.getByRole("combobox", { name: "fire" })).toHaveText("Walls");
  await expect(settings.getByRole("combobox", { name: "DOOR" })).toHaveText("Flat");
  await settings.getByRole("combobox", { name: "DOOR" }).click();
  await page.getByRole("option", { name: "Glass" }).click();
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();

  // A new drawing: the room entered for an outlet goes with its label.
  await page.getByLabel("Find an outlet").fill("P1-2");
  await page.getByLabel("Find an outlet").press("Enter");
  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByLabel("Room or desk").fill("Help desk");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Outlet saved")).toBeVisible();
  await page.getByRole("button", { name: "More for this plan" }).click();
  await page.getByRole("menuitem", { name: "Upload a new drawing" }).click();
  const replace = page.getByRole("dialog");
  await replace.getByLabel("Floor plan (PDF or SVG)").setInputFiles({ name: "Office v2.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg.replace('x="150"', 'x="152"')) });
  await expect(replace).toContainText("The room, device and note entered for 1 outlet go with its label.");
  await replace.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Floor plan saved")).toBeVisible();
  await page.getByLabel("Find an outlet").fill("P1-2");
  await page.getByLabel("Find an outlet").press("Enter");
  await expect(card).toContainText("Help desk");

  // In Arabic.
  await page.goto(`/ar/network/floor-plan?plan=${id}`);
  await expect(page.getByRole("radio", { name: "ثلاثي الأبعاد" })).toBeVisible();

  // Gone.
  await page.goto(`/en/network/floor-plan?plan=${id}`);
  await page.getByRole("button", { name: "More for this plan" }).click();
  await page.getByRole("menuitem", { name: "Plan and switches" }).click();
  await page.getByRole("dialog", { name: "Plan and switches" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("img", { name: `${name}, the floor plan` })).toBeHidden();
  console.assertClean();
});
