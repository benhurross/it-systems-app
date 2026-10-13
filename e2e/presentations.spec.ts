import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { DEMO_PASSWORD } from "../src/server/seed/demo-data";
import { BASE_URL, session } from "./env";
import { choose, pdfFile, png, signedOut, unique, watchConsole } from "./helpers";

// The decks are invented (tests/fixtures/decks). The library's "Company overview" deck and the
// admin's presentation come from the global setup; journeys here add and remove their own.

const deckFile = (name: string) => ({
  name: `${name}.pptx`,
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  buffer: readFileSync(`tests/fixtures/decks/${name}.pptx`),
});

async function download(page: Page, action: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

/** The XML of each slide of a PowerPoint file, in the order they are shown. */
function slideXml(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const presentation = strFromU8(files["ppt/presentation.xml"]);
  const rels = strFromU8(files["ppt/_rels/presentation.xml.rels"]);
  return [...presentation.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map(([, id]) => {
    const target = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))![1];
    return strFromU8(files[`ppt/${target}`]);
  });
}

/** The text of each slide of a PowerPoint file, in the order they are shown. */
const slideTexts = (bytes: Uint8Array) =>
  slideXml(bytes).map((xml) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map(([p]) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join("")).join(" "));

// Browsers run side by side; each makes presentations as a salesperson, under its own titles.
const salesperson = (info: TestInfo) => (info.project.name === "firefox" ? "it3@applus.test" : "it2@applus.test");

/** A salesperson the Presentations tool has been opened to by the admin of `admin`. */
async function salespersonPage(browser: Browser, admin: Page, email: string) {
  const users = (await (await admin.request.get("/api/settings/users")).json()) as { id: string; email: string }[];
  const userId = users.find((u) => u.email === email)!.id;
  expect((await admin.request.post("/api/tools/exceptions", { data: { userId, tool: "presentations", state: "allowed" } })).ok()).toBe(true);
  const context = await signedOut(browser);
  const res = await context.request.post("/api/auth/sign-in/email", { data: { email, password: DEMO_PASSWORD }, headers: { origin: BASE_URL } });
  expect(res.ok()).toBe(true);
  return context.newPage();
}

test.describe("the slide library", () => {
  test.use({ storageState: session("admin") });

  test("an admin adds a deck, refuses one that is not widescreen, sets it up and removes it", async ({ page }, info) => {
    const name = unique(info, "Engineering deck");
    await page.goto("/en/tools/presentations/library");
    await expect(page.getByRole("heading", { name: "Slide library", level: 1 })).toBeVisible();

    // A 4:3 deck is refused, saying how to make it widescreen.
    await page.getByRole("button", { name: "Add a deck" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("PowerPoint file (.pptx)").setInputFiles(deckFile("square"));
    await dialog.getByRole("button", { name: "Add deck" }).click();
    await expect(dialog.getByRole("alert")).toContainText("This deck is not widescreen");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // The refusal above is the browser's only expected error.
    const console = watchConsole(page);

    // Its slide pictures come from a PDF of it: no LibreOffice needed.
    await page.getByRole("button", { name: "Add a deck" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await choose(page, "Kind", "Engineering");
    await dialog.getByLabel("PowerPoint file (.pptx)").setInputFiles(deckFile("engineering"));
    await dialog.getByLabel("PDF of the deck (optional)").setInputFiles(await pdfFile("engineering.pdf", 2));
    await dialog.getByRole("button", { name: "Add deck" }).click();
    await expect(page.getByText("Deck added.")).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: name });
    await expect(card).toContainText("2 slides");

    // Its settings: a slide renamed and not chosen to start with, the cover's colour and picture.
    await card.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await page.getByLabel("Name of slide 1").fill("Cover photo");
    await page.getByRole("listitem").filter({ has: page.getByLabel("Name of slide 2") }).getByRole("checkbox", { name: "Start chosen" }).click();
    await page.getByRole("textbox", { name: "Colour", exact: true }).fill("112233");
    await page.getByLabel("Picture behind the cover").setInputFiles({ name: "site.png", mimeType: "image/png", buffer: png(1600, 900) });
    await expect(page.getByText("Cover picture saved.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove the picture" })).toBeVisible();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Deck saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name of slide 1")).toHaveValue("Cover photo");
    await expect(page.getByRole("listitem").filter({ has: page.getByLabel("Name of slide 2") }).getByRole("checkbox", { name: "Start chosen" })).not.toBeChecked();
    await expect(page.getByRole("textbox", { name: "Colour", exact: true })).toHaveValue("112233");

    await page.getByRole("link", { name: "Slide library" }).click();
    await card.getByRole("button", { name: `Remove: ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Deck removed.")).toBeVisible();
    await expect(card).toHaveCount(0);
    console.assertClean();
  });
});

test.describe("a salesperson", () => {
  test.use({ storageState: session("admin") });

  test("makes a presentation from the library, adds their own slide, and downloads it", async ({ browser, page: admin }, info) => {
    const page = await salespersonPage(browser, admin, salesperson(info));
    const console = watchConsole(page);
    const title = unique(info, "Proposal");

    await page.goto("/en/tools");
    await page.getByRole("region", { name: "Presentations" }).getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/presentations$/);
    await page.getByRole("button", { name: "New presentation" }).first().click();
    const dialog = page.getByRole("dialog");
    await choose(page, "Start from", /^Company overview/);
    await dialog.getByLabel("Presentation title").fill(title);
    await dialog.getByLabel("Client or prospect").fill("Example Trading Co.");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/presentations\/\d+$/);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

    // The cover, the contents, then the deck's slides chosen to start with: not the one meant for writing on.
    const chosen = page.getByRole("region", { name: "Slides in this presentation" }).getByRole("listitem");
    await expect(chosen).toHaveCount(4);
    await expect(chosen.nth(0)).toContainText("Cover");
    await expect(chosen.nth(1)).toContainText("Contents");
    await expect(chosen.nth(1)).toContainText("03Welcome {client}");
    await expect(chosen.nth(2)).toContainText("Welcome {client}");

    // A slide from the library, then a slide of their own with a picture.
    const library = page.getByRole("complementary", { name: "Add slides" });
    await library.getByRole("button", { name: "Add “Extra slide”" }).click();
    await expect(chosen).toHaveCount(5);
    await page.getByRole("button", { name: "Add your own slide" }).click();
    const own = page.getByRole("dialog");
    await own.getByRole("textbox", { name: "Title", exact: true }).fill("Why {client}");
    await own.getByRole("textbox", { name: "Text", exact: true }).fill("Dedicated account team\nClaims within 24 hours");
    await own.getByLabel("Picture", { exact: true }).setInputFiles({ name: "team.png", mimeType: "image/png", buffer: png(800, 600) });
    await expect(own.getByRole("button", { name: "Remove the picture" })).toBeVisible();
    await own.getByRole("button", { name: "Save slide" }).click();
    await expect(chosen).toHaveCount(6);
    await page.getByRole("button", { name: "Move slide 6 earlier" }).click();
    await expect(chosen.nth(4)).toContainText("Why {client}");
    // The contents follows: the own slide is now slide 5.
    await expect(chosen.nth(1)).toContainText("05Why {client}");
    await expect(page.getByText("All changes saved")).toBeVisible();

    // PowerPoint: the slides in order, the fill-ins filled in.
    const pptx = await download(page, () => page.getByRole("button", { name: "PowerPoint" }).click());
    expect(pptx.name).toBe(`${title} - Example Trading Co.pptx`);
    const texts = slideTexts(pptx.bytes);
    expect(texts).toHaveLength(6);
    expect(texts[0]).toContain(title);
    expect(texts[0]).toContain("Example Trading Co.");
    expect(texts[1]).toContain("Contents");
    expect(texts[1]).toContain("03 Welcome Example Trading Co.");
    expect(texts[1]).toContain("05 Why Example Trading Co.");
    expect(texts[2]).toContain("Welcome Example Trading Co.");
    expect(texts[4]).toContain("Why Example Trading Co.");
    // Every slide but the cover is numbered.
    expect(slideXml(pptx.bytes).map((xml) => xml.includes('type="slidenum"'))).toEqual([false, true, true, true, true, true]);

    // PDF, made by LibreOffice: a page a slide.
    const pdf = await download(page, () => page.getByRole("button", { name: "PDF" }).click());
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(6);

    // Kept: the same slides after a reload, and in the list of their presentations.
    await page.reload();
    await expect(chosen).toHaveCount(6);
    await page.getByRole("link", { name: "My presentations" }).click();
    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card).toContainText("6 slides");

    // A copy for another client opens to be changed; deleting it leaves the original.
    await card.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByRole("heading", { name: `${title} (copy)`, level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "My presentations" }).click();
    const copy = page.getByRole("listitem").filter({ hasText: `${title} (copy)` });
    await copy.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Presentation deleted.")).toBeVisible();
    await expect(copy).toHaveCount(0);
    await expect(card).toHaveCount(1);
    console.assertClean();
    await page.context().close();
  });
});

test.describe("someone the tool is not open to", () => {
  test.use({ storageState: session("employee") });

  test("is asked to request it, and cannot open the library", async ({ page }) => {
    await page.goto("/en/tools/presentations");
    await expect(page.getByRole("button", { name: "Request access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New presentation" })).toHaveCount(0);
    await page.goto("/en/tools/presentations/library");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not available");
    expect((await page.request.get("/api/presentations/decks")).status()).toBe(403);
  });
});
