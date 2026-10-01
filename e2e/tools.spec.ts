import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { session } from "./env";
import { pdfFile, png, watchConsole } from "./helpers";

// The tools work in the browser, so each journey checks the file it downloads. Pages are told
// apart by their width: page n of a test PDF is `base + n` points wide.
test.use({ storageState: session("employee") });

async function download(page: Page, action: () => Promise<unknown>) {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

async function widths(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
}

/** A page thumbnail that pdf.js has finished drawing. */
const drawn = (thumb: Locator) => expect(thumb).not.toHaveClass(/animate-pulse/);

/** The PDF toolkit open in one of its modes; the panel that mode shows. */
async function toolkit(page: Page, mode: string) {
  await page.goto("/en/tools/pdf");
  await page.getByRole("tab", { name: new RegExp(`^${mode}`) }).click();
  await expect(page.getByRole("tab", { name: new RegExp(`^${mode}`) })).toHaveAttribute("aria-selected", "true");
  return page.getByRole("tabpanel");
}

test("the tools list shows the PDF toolkit and the other tools, open to employees", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/home");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/tools$/);
  for (const name of ["PDF toolkit", "Images to PDF", "Page numbers and watermark"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("list", { name: "Choose a tool" }).getByRole("listitem")).toHaveText(["Merge", "Split", "Organize", "PDF to Word"]);
  await expect(page.getByRole("link", { name: "Open" })).toHaveCount(3);

  await page.getByRole("link", { name: "Open" }).first().click();
  await expect(page).toHaveURL(/\/en\/tools\/pdf$/);
  await expect(page.getByRole("tab")).toHaveText([/^Merge/, /^Split/, /^Organize/, /^PDF to Word/]);
  await expect(page.getByText("Files stay on this computer")).toBeVisible();

  // Each mode keeps its address, and the pages the tools had before lead to their mode.
  await page.getByRole("tab", { name: /^Split/ }).click();
  await expect(page).toHaveURL(/\/en\/tools\/pdf\?mode=split$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Split/ })).toHaveAttribute("aria-selected", "true");
  await page.goto("/en/tools/pdf-organize");
  await expect(page).toHaveURL(/\/en\/tools\/pdf\?mode=organize$/);
  await expect(page.getByRole("tab", { name: /^Organize/ })).toHaveAttribute("aria-selected", "true");
  console.assertClean();
});

test("PDFs are merged in the order chosen", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Merge");
  await panel.getByLabel("Choose files").setInputFiles([await pdfFile("alpha.pdf", 2, 500), await pdfFile("beta.pdf", 3, 600)]);
  await expect(panel.getByText("2 files, 5 pages")).toBeVisible();
  await drawn(panel.getByRole("img", { name: "beta.pdf: Page 1" }));

  await panel.getByRole("button", { name: "Move beta.pdf up" }).click();
  // More can be added under the list.
  await panel.getByLabel("Add PDFs").setInputFiles(await pdfFile("gamma.pdf", 1, 700));
  await expect(panel.getByText("3 files, 6 pages")).toBeVisible();
  const merged = await download(page, () => panel.getByRole("button", { name: "Merge PDF" }).click());
  expect(merged.name).toBe("beta-merged.pdf");
  expect(await widths(merged.bytes)).toEqual([601, 602, 603, 501, 502, 701]);
  await expect(page.getByText("Your file is ready and downloading.")).toBeVisible();

  // Something that is not a PDF is turned away with a reason.
  await panel.getByLabel("Add PDFs").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("just text") });
  await expect(panel.getByText("notes.pdf is not a PDF.")).toBeVisible();
  console.assertClean();
});

test("pages are taken out of a PDF, together or a file each", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Split");
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("report.pdf", 6, 500));
  await expect(panel.getByText("6 pages", { exact: false }).first()).toBeVisible();

  const pages = panel.getByRole("textbox", { name: "Pages" });
  await pages.fill("2-3, 5");
  await expect(panel.getByText("3 pages chosen")).toBeVisible();
  // Clicking a page adds it to what is written.
  const sixth = panel.getByRole("button", { name: "Page 6" });
  await drawn(sixth.locator("canvas"));
  await sixth.click();
  await expect(sixth).toHaveAttribute("aria-pressed", "true");
  await expect(pages).toHaveValue("2-3, 5-6");

  const one = await download(page, () => panel.getByRole("button", { name: "Split PDF" }).click());
  expect(one.name).toBe("report-pages.pdf");
  expect(await widths(one.bytes)).toEqual([502, 503, 505, 506]);

  await panel.getByRole("radio", { name: /A PDF for each range/ }).check();
  const zip = await download(page, () => panel.getByRole("button", { name: "Split PDF" }).click());
  expect(zip.name).toBe("report-split.zip");
  const files = unzipSync(zip.bytes);
  expect(Object.keys(files)).toEqual(["report-pages-2-3.pdf", "report-pages-5-6.pdf"]);
  expect(await widths(files["report-pages-5-6.pdf"])).toEqual([505, 506]);

  await panel.getByRole("button", { name: "Even" }).click();
  await expect(pages).toHaveValue("2, 4, 6");
  await pages.fill("4-9");
  await expect(panel.getByText("Use page numbers from 1 to 6, like 1-3, 5.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Split PDF" })).toBeDisabled();
  console.assertClean();
});

test("pages are turned, moved and removed", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Organize");
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("scan.pdf", 3, 500));
  await expect(panel.getByRole("button", { name: "Turn page 1 right" })).toBeVisible();

  await panel.getByRole("button", { name: "Turn page 1 right" }).click();
  await panel.getByRole("button", { name: "Move page 3 earlier" }).click();
  await panel.getByRole("button", { name: "Remove page 2" }).click();
  await expect(panel.getByRole("button", { name: "Put back page 2" })).toBeVisible();
  await expect(panel.getByText("2 of 3 pages")).toBeVisible();

  const saved = await download(page, () => panel.getByRole("button", { name: "Save PDF" }).click());
  expect(saved.name).toBe("scan-organized.pdf");
  const pdf = await PDFDocument.load(saved.bytes);
  expect(pdf.getPages().map((p) => [Math.round(p.getWidth()), p.getRotation().angle])).toEqual([
    [501, 90],
    [503, 0],
  ]);

  // Turning them all, then starting over.
  await panel.getByRole("button", { name: "Turn all left" }).click();
  const turned = await download(page, () => panel.getByRole("button", { name: "Save PDF" }).click());
  expect((await PDFDocument.load(turned.bytes)).getPages().map((p) => p.getRotation().angle)).toEqual([0, 270]);
  await panel.getByRole("button", { name: "Start over" }).click();
  await expect(panel.getByText("3 of 3 pages")).toBeVisible();
  console.assertClean();
});

test("a PDF becomes a Word document with its headings, text and pictures", async ({ page }) => {
  const console = watchConsole(page);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const first = pdf.addPage([595, 842]);
  first.drawText("Network policy", { x: 72, y: 760, size: 24, font: bold });
  first.drawText("Every device on the network is registered with IT.", { x: 72, y: 720, size: 11, font: regular });
  first.drawImage(await pdf.embedPng(png(300, 150)), { x: 72, y: 450, width: 300, height: 150 });
  pdf.addPage([595, 842]).drawText("Second page", { x: 72, y: 760, size: 11, font: regular });
  const file = { name: "network-policy.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };

  const panel = await toolkit(page, "PDF to Word");
  await panel.getByLabel("Choose a PDF").setInputFiles(file);
  await expect(panel.getByRole("switch", { name: "Keep page breaks" })).toBeChecked();
  const word = await download(page, () => panel.getByRole("button", { name: "Convert to Word" }).click());
  expect(word.name).toBe("network-policy.docx");
  await expect(panel.getByText("network-policy.docx is ready")).toBeVisible();

  const parts = unzipSync(word.bytes);
  const xml = strFromU8(parts["word/document.xml"]);
  expect(xml).toMatch(/<w:pStyle w:val="Heading1"\/>.*Network policy/);
  expect(xml).toContain("Every device on the network is registered with IT.");
  expect(xml).toMatch(/<w:pageBreakBefore\/>.*Second page/);
  expect(Object.keys(parts).filter((name) => name.startsWith("word/media/"))).toHaveLength(1);

  // Again without pictures or page breaks.
  await panel.getByRole("button", { name: "Convert another PDF" }).click();
  await panel.getByLabel("Choose a PDF").setInputFiles(file);
  await panel.getByRole("switch", { name: "Include pictures" }).click();
  await panel.getByRole("switch", { name: "Keep page breaks" }).click();
  const plain = unzipSync((await download(page, () => panel.getByRole("button", { name: "Convert to Word" }).click())).bytes);
  expect(Object.keys(plain).some((name) => name.startsWith("word/media/"))).toBe(false);
  expect(strFromU8(plain["word/document.xml"])).not.toContain("<w:pageBreakBefore/>");
  console.assertClean();
});

test("images become a PDF, a page each", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/tools/images-to-pdf");
  await page.getByLabel("Choose images").setInputFiles([
    { name: "wide.png", mimeType: "image/png", buffer: png(800, 400) },
    { name: "tall.png", mimeType: "image/png", buffer: png(300, 600) },
  ]);
  await expect(page.getByText("800 × 400")).toBeVisible();

  const a4 = await download(page, () => page.getByRole("button", { name: "Make PDF and download" }).click());
  expect(a4.name).toBe("wide.pdf");
  const sizes = (await PDFDocument.load(a4.bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  expect(sizes).toEqual([
    [842, 595],
    [595, 842],
  ]);

  // Pages the size of each image, with the small margin around them.
  await page.getByLabel("Same as each image").check();
  await expect(page.getByText("Orientation")).toBeHidden();
  const fitted = await download(page, () => page.getByRole("button", { name: "Make PDF and download" }).click());
  expect((await PDFDocument.load(fitted.bytes)).getPage(0).getSize()).toEqual({ width: 636, height: 336 });

  await page.getByLabel("Add images").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
  await expect(page.getByText("notes.txt is not an image this tool can read.")).toBeVisible();
  console.assertClean();
});

test("pages are numbered and watermarked", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/tools/pdf-stamp");
  await page.getByLabel("Choose a PDF").setInputFiles(await pdfFile("policy.pdf", 3, 500));
  await drawn(page.getByRole("img", { name: "First page, as it will look" }));

  await page.getByRole("switch", { name: "Add a watermark" }).click();
  const text = page.getByLabel("Watermark text");
  await expect(text).toHaveValue("CONFIDENTIAL");
  await text.fill("سري");
  await expect(page.getByText("Use Latin letters, numbers and punctuation only.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply and download" })).toBeDisabled();
  await text.fill("COPY");
  await page.getByLabel("Top right").check();

  const stamped = await download(page, () => page.getByRole("button", { name: "Apply and download" }).click());
  expect(stamped.name).toBe("policy-stamped.pdf");
  expect(await widths(stamped.bytes)).toEqual([501, 502, 503]);
  expect(stamped.bytes.length).toBeGreaterThan((await pdfFile("policy.pdf", 3, 500)).buffer.length);

  await page.getByRole("switch", { name: "Add page numbers" }).click();
  await page.getByRole("switch", { name: "Add a watermark" }).click();
  await expect(page.getByText("Choose page numbers, a watermark or both.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply and download" })).toBeDisabled();
  console.assertClean();
});
