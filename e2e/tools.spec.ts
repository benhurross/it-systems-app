import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
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

test("the tools list shows every PDF tool, open to employees", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/home");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/tools$/);
  for (const name of ["Merge PDFs", "Split PDF", "Organize pages", "Images to PDF", "Page numbers and watermark"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Open" })).toHaveCount(5);
  console.assertClean();
});

test("PDFs are merged in the order chosen", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/tools/pdf-merge");
  await expect(page.getByText("Your files stay on this computer.")).toBeVisible();
  await page.getByLabel("Choose files").setInputFiles([await pdfFile("alpha.pdf", 2, 500), await pdfFile("beta.pdf", 3, 600)]);
  await expect(page.getByText("2 files, 5 pages")).toBeVisible();
  await drawn(page.getByRole("img", { name: "beta.pdf: Page 1" }));

  await page.getByRole("button", { name: "Move beta.pdf up" }).click();
  const merged = await download(page, () => page.getByRole("button", { name: "Merge and download" }).click());
  expect(merged.name).toBe("beta-merged.pdf");
  expect(await widths(merged.bytes)).toEqual([601, 602, 603, 501, 502]);
  await expect(page.getByText("Your file is ready and downloading.")).toBeVisible();

  // Something that is not a PDF is turned away with a reason.
  await page.getByLabel("Choose files").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("just text") });
  await expect(page.getByText("notes.pdf is not a PDF.")).toBeVisible();
  console.assertClean();
});

test("pages are taken out of a PDF, together or a file each", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/tools/pdf-split");
  await page.getByLabel("Choose a PDF").setInputFiles(await pdfFile("report.pdf", 6, 500));
  await expect(page.getByText("6 pages")).toBeVisible();

  const pages = page.getByRole("textbox", { name: "Pages" });
  await pages.fill("2-3, 5");
  await expect(page.getByText("3 pages chosen")).toBeVisible();
  // Clicking a page adds it to what is written.
  const sixth = page.getByRole("button", { name: "Page 6" });
  await drawn(sixth.locator("canvas"));
  await sixth.click();
  await expect(sixth).toHaveAttribute("aria-pressed", "true");
  await expect(pages).toHaveValue("2-3, 5-6");

  const one = await download(page, () => page.getByRole("button", { name: "Download", exact: true }).click());
  expect(one.name).toBe("report-pages.pdf");
  expect(await widths(one.bytes)).toEqual([502, 503, 505, 506]);

  await page.getByLabel("A PDF for each range").check();
  const zip = await download(page, () => page.getByRole("button", { name: "Download", exact: true }).click());
  expect(zip.name).toBe("report-split.zip");
  const files = unzipSync(zip.bytes);
  expect(Object.keys(files)).toEqual(["report-pages-2-3.pdf", "report-pages-5-6.pdf"]);
  expect(await widths(files["report-pages-5-6.pdf"])).toEqual([505, 506]);

  await pages.fill("4-9");
  await expect(page.getByText("Use page numbers from 1 to 6, like 1-3, 5.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
  console.assertClean();
});

test("pages are turned, moved and removed", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/tools/pdf-organize");
  await page.getByLabel("Choose a PDF").setInputFiles(await pdfFile("scan.pdf", 3, 500));
  await expect(page.getByRole("button", { name: "Turn page 1 right" })).toBeVisible();

  await page.getByRole("button", { name: "Turn page 1 right" }).click();
  await page.getByRole("button", { name: "Move page 3 earlier" }).click();
  await page.getByRole("button", { name: "Remove page 2" }).click();
  await expect(page.getByRole("button", { name: "Put back page 2" })).toBeVisible();
  await expect(page.getByText("2 pages", { exact: true })).toBeVisible();

  const saved = await download(page, () => page.getByRole("button", { name: "Save PDF" }).click());
  expect(saved.name).toBe("scan-organized.pdf");
  const pdf = await PDFDocument.load(saved.bytes);
  expect(pdf.getPages().map((p) => [Math.round(p.getWidth()), p.getRotation().angle])).toEqual([
    [501, 90],
    [503, 0],
  ]);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByText("3 pages", { exact: true })).toBeVisible();
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

  await page.getByLabel("Choose images").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
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
