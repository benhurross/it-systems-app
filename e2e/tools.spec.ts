import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts } from "pdf-lib";
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

test("the tools list leads into each tool of the PDF toolkit", async ({ page }) => {
  const console = watchConsole(page);
  await page.goto("/en/home");
  await page.getByRole("link", { name: "Tools", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/tools$/);
  await expect(page.getByRole("heading", { name: "PDF toolkit" })).toBeVisible();
  const modes = [/^Merge/, /^Split/, /^Organize/, /^Compress/, /^Fill in/, /^Sign/, /^PDF to Word/, /^Images to PDF/, /^Numbers & watermark/];
  await expect(page.getByRole("list", { name: "Choose a tool" }).getByRole("link")).toHaveText(modes);
  await expect(page.getByText("Files stay on this computer")).toBeVisible();

  // Straight into a mode, which the address keeps.
  await page.getByRole("link", { name: /^Split/ }).click();
  await expect(page).toHaveURL(/\/en\/tools\/pdf\?mode=split$/);
  await expect(page.getByRole("tab", { name: /^Split/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveText(modes);
  await page.getByRole("tab", { name: /^Organize/ }).click();
  await expect(page).toHaveURL(/\/en\/tools\/pdf\?mode=organize$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Organize/ })).toHaveAttribute("aria-selected", "true");

  // The pages the tools had before lead to their mode.
  for (const [old, mode] of [
    ["pdf-merge", "Merge"],
    ["images-to-pdf", "Images to PDF"],
    ["pdf-stamp", "Numbers & watermark"],
  ]) {
    await page.goto(`/en/tools/${old}`);
    await expect(page.getByRole("tab", { name: new RegExp(`^${mode}`) })).toHaveAttribute("aria-selected", "true");
  }
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
  const panel = await toolkit(page, "Images to PDF");
  await panel.getByLabel("Choose images").setInputFiles([
    { name: "wide.png", mimeType: "image/png", buffer: png(800, 400) },
    { name: "tall.png", mimeType: "image/png", buffer: png(300, 600) },
  ]);
  await expect(panel.getByText("800 × 400")).toBeVisible();

  const a4 = await download(page, () => panel.getByRole("button", { name: "Make PDF and download" }).click());
  expect(a4.name).toBe("wide.pdf");
  const sizes = (await PDFDocument.load(a4.bytes)).getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
  expect(sizes).toEqual([
    [842, 595],
    [595, 842],
  ]);

  // Pages the size of each image, with the small margin around them.
  await panel.getByLabel("Same as each image").check();
  await expect(panel.getByText("Orientation")).toBeHidden();
  const fitted = await download(page, () => panel.getByRole("button", { name: "Make PDF and download" }).click());
  expect((await PDFDocument.load(fitted.bytes)).getPage(0).getSize()).toEqual({ width: 636, height: 336 });

  await panel.getByLabel("Add images").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("text") });
  await expect(panel.getByText("notes.txt is not an image this tool can read.")).toBeVisible();
  console.assertClean();
});

test("pages are numbered and watermarked", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Numbers & watermark");
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("policy.pdf", 3, 500));
  await drawn(panel.getByRole("img", { name: "First page, as it will look" }));

  await panel.getByRole("switch", { name: "Add a watermark" }).click();
  const text = panel.getByLabel("Watermark text");
  await expect(text).toHaveValue("CONFIDENTIAL");
  await text.fill("سري");
  await expect(panel.getByText("Use Latin letters, numbers and punctuation only.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Apply and download" })).toBeDisabled();
  await text.fill("COPY");
  await panel.getByLabel("Top right").check();

  const stamped = await download(page, () => panel.getByRole("button", { name: "Apply and download" }).click());
  expect(stamped.name).toBe("policy-stamped.pdf");
  expect(await widths(stamped.bytes)).toEqual([501, 502, 503]);
  expect(stamped.bytes.length).toBeGreaterThan((await pdfFile("policy.pdf", 3, 500)).buffer.length);

  await panel.getByRole("switch", { name: "Add page numbers" }).click();
  await panel.getByRole("switch", { name: "Add a watermark" }).click();
  await expect(panel.getByText("Choose page numbers, a watermark or both.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Apply and download" })).toBeDisabled();
  console.assertClean();
});

test("a PDF is made smaller, its pictures shrunk and its text kept", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Compress");

  // A phone photo and a screenshot, made by the browser as a camera and a screen would make them.
  const [photo, screenshot] = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(2400, 3200);
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 2400, 3200);
    gradient.addColorStop(0, "#1d4ed8");
    gradient.addColorStop(1, "#f59e0b");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2400, 3200);
    // Grain, as a camera's sensor adds.
    const pixels = context.getImageData(0, 0, 2400, 3200);
    for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i] = (pixels.data[i] + ((i * 7919) % 31)) & 0xff;
    context.putImageData(pixels, 0, 0);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
    const shot = new OffscreenCanvas(1400, 900);
    const ink = shot.getContext("2d")!;
    ink.fillStyle = "#fff";
    ink.fillRect(0, 0, 1400, 900);
    ink.fillStyle = "#111";
    ink.font = "22px sans-serif";
    for (let line = 0; line < 30; line++) ink.fillText(`Line ${line + 1}: error 0x8004 after the update`, 30, 40 + line * 28);
    const png = await shot.convertToBlob({ type: "image/png" });
    const bytes = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));
    return [await bytes(jpeg), await bytes(png)];
  });
  const original = await PDFDocument.create();
  const font = await original.embedFont(StandardFonts.Helvetica);
  const first = original.addPage([595, 842]);
  first.drawText("Site survey", { x: 40, y: 800, size: 18, font });
  first.drawImage(await original.embedJpg(new Uint8Array(photo)), { x: 40, y: 40, width: 515, height: 687 });
  original.addPage([842, 595]).drawImage(await original.embedPng(new Uint8Array(screenshot)), { x: 40, y: 40, width: 700, height: 450 });
  const bytes = Buffer.from(await original.save());

  await panel.getByLabel("Choose a PDF").setInputFiles({ name: "survey.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(panel.getByLabel("Recommended")).toBeChecked();
  const compressed = await download(page, () => panel.getByRole("button", { name: "Compress and download" }).click());
  expect(compressed.name).toBe("survey-compressed.pdf");
  expect(compressed.bytes.length).toBeLessThan(bytes.length / 2);
  await expect(panel.getByRole("status")).toContainText("→");
  await expect(panel.getByRole("status")).toContainText("% smaller");

  // The pages and the text are as they were; the photo is no larger than a page needs.
  const out = await PDFDocument.load(compressed.bytes);
  expect(out.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [595, 842],
    [842, 595],
  ]);
  const jpegSizes = out.context
    .enumerateIndirectObjects()
    .flatMap(([, o]) => (o instanceof PDFRawStream && o.dict.lookup(PDFName.of("Filter")) === PDFName.of("DCTDecode") ? [o.dict] : []))
    .map((dict) => [dict.lookup(PDFName.of("Width"), PDFNumber).asNumber(), dict.lookup(PDFName.of("Height"), PDFNumber).asNumber()]);
  expect(jpegSizes).toContainEqual([1500, 2000]);
  expect(out.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys()).toHaveLength(1);

  // A PDF with nothing to shrink is not downloaded again.
  await panel.getByRole("button", { name: "Change file" }).click();
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("policy.pdf", 2));
  await panel.getByLabel("Smallest").check();
  await panel.getByRole("button", { name: "Compress and download" }).click();
  await expect(panel.getByRole("status")).toHaveText("This PDF is already about as small as it can be, so nothing was downloaded.");
  console.assertClean();
});

test("a PDF is signed: drawn, placed, moved and dated", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Sign");
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("handover.pdf", 2));
  await expect(panel.getByText("Make your signature first, on the left.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add signature to this page" })).toBeDisabled();

  // Signed on the pad, with the mouse.
  const pad = panel.getByRole("img", { name: /^Signature pad/ });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 40 + i * 15, box.y + box.height / 2 + (i % 2 ? -25 : 25));
  await page.mouse.up();
  await expect(panel.getByRole("img", { name: "Page 1" })).not.toHaveClass(/animate-pulse/);
  await panel.getByRole("button", { name: "Add signature to this page" }).click();
  const signature = panel.getByRole("group", { name: "Signature on page 1" });
  await expect(signature).toBeVisible();
  await expect(panel.getByText("Signed on page 1")).toBeVisible();

  // Moved by keyboard; a second one on the next page, then removed.
  const before = (await signature.boundingBox())!;
  await signature.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await signature.boundingBox())!.x).toBeLessThan(before.x - 10);
  await panel.getByRole("button", { name: "Next page" }).click();
  await panel.getByRole("button", { name: "Add signature to this page" }).click();
  await expect(panel.getByText("Signed on pages 1, 2")).toBeVisible();
  await panel.getByRole("button", { name: "Remove the signature on page 2" }).click();
  await expect(panel.getByText("Signed on page 1")).toBeVisible();

  // The date: only what the PDF's font can write.
  await panel.getByRole("switch", { name: "Add the date under the signature" }).click();
  await panel.getByLabel("Date", { exact: true }).fill("١٥ أكتوبر");
  await expect(panel.getByText("Use Latin letters, numbers and punctuation only.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sign and download" })).toBeDisabled();
  await panel.getByLabel("Date", { exact: true }).fill("15 Oct 2026");

  const signed = await download(page, () => panel.getByRole("button", { name: "Sign and download" }).click());
  expect(signed.name).toBe("handover-signed.pdf");
  const out = await PDFDocument.load(signed.bytes);
  const pictures = (n: number) => out.getPage(n).node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0;
  expect(pictures(0)).toBe(1);
  expect(pictures(1)).toBe(0);
  expect(await widths(signed.bytes)).toEqual([501, 502]);

  // Or typed.
  await panel.getByRole("tab", { name: "Type" }).click();
  await expect(panel.getByRole("button", { name: "Sign and download" })).toBeDisabled();
  await panel.getByLabel("Your name").fill("Sara Ahmed");
  await expect(panel.getByRole("button", { name: "Sign and download" })).toBeEnabled();
  console.assertClean();
});

/** A small equipment request form, with each kind of field. */
async function requestForm() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const form = pdf.getForm();
  const name = form.createTextField("employee_name");
  name.enableRequired();
  name.addToPage(page, { x: 50, y: 700, width: 300, height: 24 });
  form.createCheckBox("urgent").addToPage(page, { x: 50, y: 650, width: 16, height: 16 });
  const kind = form.createRadioGroup("deviceType");
  kind.addOptionToPage("Laptop", page, { x: 50, y: 600, width: 16, height: 16 });
  kind.addOptionToPage("Desktop", page, { x: 150, y: 600, width: 16, height: 16 });
  const office = form.createDropdown("office");
  office.addOptions(["Jeddah", "Riyadh"]);
  office.addToPage(page, { x: 50, y: 550, width: 200, height: 24 });
  return { name: "equipment-request.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
}

test("a PDF form is filled in, seen on the page, and downloaded locked or not", async ({ page }) => {
  const console = watchConsole(page);
  const panel = await toolkit(page, "Fill in");

  // A PDF without fields says so.
  await panel.getByLabel("Choose a PDF").setInputFiles(await pdfFile("letter.pdf", 1));
  await expect(panel.getByText("This PDF has no form fields to fill in.")).toBeVisible();
  await panel.getByRole("button", { name: "Change file" }).click();

  await panel.getByLabel("Choose a PDF").setInputFiles(await requestForm());
  await expect(panel.getByText("1 required field is empty")).toBeVisible();
  await panel.getByLabel(/^Employee name/).fill("Sara Ahmed");
  await expect(panel.getByText("4 fields")).toBeVisible();
  await panel.getByRole("checkbox", { name: "Urgent" }).check();
  await panel.getByRole("radio", { name: "Desktop" }).check();
  await panel.getByRole("combobox", { name: "Office" }).click();
  await page.getByRole("option", { name: "Riyadh" }).click();
  await expect(panel.getByRole("img", { name: "Page 1, as filled in" })).not.toHaveClass(/animate-pulse/);

  const filled = await download(page, () => panel.getByRole("button", { name: "Fill in and download" }).click());
  expect(filled.name).toBe("equipment-request-filled.pdf");
  const form = (await PDFDocument.load(filled.bytes)).getForm();
  expect(form.getTextField("employee_name").getText()).toBe("Sara Ahmed");
  expect(form.getCheckBox("urgent").isChecked()).toBe(true);
  expect(form.getRadioGroup("deviceType").getSelected()).toBe("Desktop");
  expect(form.getDropdown("office").getSelected()).toEqual(["Riyadh"]);

  // Locked, the answers become part of the page.
  await panel.getByRole("switch", { name: "Lock the answers" }).click();
  await expect(panel.getByText("Locked answers become part of the page")).toBeVisible();
  const locked = await download(page, () => panel.getByRole("button", { name: "Fill in and download" }).click());
  expect((await PDFDocument.load(locked.bytes)).getForm().getFields()).toHaveLength(0);

  // Arabic answers are left to the PDF reader, so they cannot be locked.
  await panel.getByLabel(/^Employee name/).fill("سارة أحمد");
  await panel.getByRole("button", { name: "Fill in and download" }).click();
  await expect(panel.getByText(/Answers in Arabic or other scripts beyond Latin letters cannot be locked/)).toBeVisible();
  await panel.getByRole("switch", { name: "Lock the answers" }).click();
  const arabic = await download(page, () => panel.getByRole("button", { name: "Fill in and download" }).click());
  expect((await PDFDocument.load(arabic.bytes)).getForm().getTextField("employee_name").getText()).toBe("سارة أحمد");
  console.assertClean();
});
