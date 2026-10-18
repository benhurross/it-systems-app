import { degrees, type PDFDocument, type PDFFont, type PDFPage, PDFBool, PDFName, rgb, StandardFonts } from "pdf-lib";
import { asShown } from "./pdf-geometry";
import { loadPdf } from "./pdf-tools";

/**
 * Writing on any PDF, as on paper: text typed where it is placed, and ticks, crosses and dots
 * for boxes to mark. It is written into the page, or made into fillable fields for others to fill.
 *
 * Text in Latin letters is written as text. Other scripts (Arabic above all) need their letters
 * joined, which the standard fonts here cannot do; the browser draws such text, and the picture it
 * makes is placed instead, exactly as it was typed.
 */

/** Text from its top left, in fractions of the page as shown; `size` in points. */
export type WrittenText = {
  kind: "text";
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
  /** The text drawn by the browser, for scripts the standard font cannot write: its size in fractions of the page as shown. */
  picture?: { png: Uint8Array; width: number; height: number };
};
/** A mark centred at (x, y), in fractions of the page as shown; `size` in points across. */
export type WrittenMark = { kind: "tick" | "cross" | "dot"; page: number; x: number; y: number; size: number };
export type WrittenItem = WrittenText | WrittenMark;

/** The line height for text, as a share of its size. */
export const LINE_HEIGHT = 1.25;
const INK = rgb(0.05, 0.05, 0.1);

/** Whether the standard font can write the text (line breaks aside). */
export function writable(font: PDFFont, text: string) {
  try {
    font.encodeText(text.replace(/[\r\n\t]/g, ""));
    return true;
  } catch {
    return false;
  }
}

/** The strokes of a mark, as lines from point to point, around (0, 0) for a mark one unit across, y upwards. */
const STROKES: Record<"tick" | "cross", [number, number][][]> = {
  tick: [
    [
      [-0.38, 0.02],
      [-0.12, -0.3],
      [0.4, 0.36],
    ],
  ],
  cross: [
    [
      [-0.34, -0.34],
      [0.34, 0.34],
    ],
    [
      [-0.34, 0.34],
      [0.34, -0.34],
    ],
  ],
};

function drawText(page: PDFPage, item: WrittenText, font: PDFFont, pictures: Map<WrittenText, Awaited<ReturnType<PDFDocument["embedPng"]>>>) {
  const view = asShown(page);
  const rotate = degrees(view.rotation);
  const left = item.x * view.size.width;
  const top = (1 - item.y) * view.size.height;
  const picture = pictures.get(item);
  if (picture && item.picture) {
    const width = item.picture.width * view.size.width;
    const height = item.picture.height * view.size.height;
    page.drawImage(picture, { ...view.point(left, top - height), width, height, rotate });
    return;
  }
  item.text.split(/\r?\n/).forEach((line, i) => {
    if (!line) return;
    // Each line stands on its baseline, a little under the top of its line.
    const baseline = top - item.size * 0.9 - i * item.size * LINE_HEIGHT;
    page.drawText(line, { ...view.point(left, baseline), size: item.size, font, color: INK, rotate });
  });
}

function drawMark(page: PDFPage, item: WrittenMark) {
  const view = asShown(page);
  const cx = item.x * view.size.width;
  const cy = (1 - item.y) * view.size.height;
  const s = item.size;
  if (item.kind === "dot") {
    const centre = view.point(cx, cy);
    page.drawCircle({ x: centre.x, y: centre.y, size: s * 0.22, color: INK });
    return;
  }
  const thickness = Math.max(0.8, s * 0.12);
  for (const stroke of STROKES[item.kind]) {
    for (let i = 1; i < stroke.length; i++) {
      const [a, b] = [stroke[i - 1], stroke[i]];
      page.drawLine({ start: view.point(cx + a[0] * s, cy + a[1] * s), end: view.point(cx + b[0] * s, cy + b[1] * s), thickness, color: INK, lineCap: 1 });
    }
  }
}

/** A box as shown (from its bottom left, in points) in the page's own coordinates. */
function pageBox(page: PDFPage, left: number, bottom: number, width: number, height: number) {
  const view = asShown(page);
  const a = view.point(left, bottom);
  const b = view.point(left + width, bottom + height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y), rotate: degrees(view.rotation) };
}

/** A field name the form does not have yet. */
function freeName(pdf: PDFDocument, stem: string) {
  const form = pdf.getForm();
  for (let n = 1; ; n++) if (!form.getFieldMaybe(`${stem}_${n}`)) return `${stem}_${n}`;
}

function addFields(pdf: PDFDocument, page: PDFPage, item: WrittenItem, font: PDFFont) {
  const form = pdf.getForm();
  const view = asShown(page);
  const border = { borderColor: rgb(0.6, 0.6, 0.65), borderWidth: 0.75 };
  if (item.kind === "text") {
    const lines = item.text.split(/\r?\n/);
    const latin = writable(font, item.text);
    const pad = item.size * 0.3;
    const width = latin ? Math.max(...lines.map((l) => font.widthOfTextAtSize(l, item.size))) + pad * 2 : (item.picture?.width ?? 0.2) * view.size.width + pad * 2;
    const height = lines.length * item.size * LINE_HEIGHT + pad;
    const left = item.x * view.size.width - pad;
    const top = (1 - item.y) * view.size.height + pad / 2;
    const field = form.createTextField(freeName(pdf, "text"));
    if (lines.length > 1) field.enableMultiline();
    field.addToPage(page, { ...pageBox(page, left, top - height, Math.max(width, item.size * 4), height), font, ...border });
    field.setFontSize(item.size);
    field.setText(item.text);
    if (latin) field.updateAppearances(font);
    // Other scripts are drawn by the PDF reader, which joins their letters.
    else pdf.catalog.getOrCreateAcroForm().dict.set(PDFName.of("NeedAppearances"), PDFBool.True);
    return;
  }
  // Every mark becomes a box to tick, ticked.
  const cx = item.x * view.size.width;
  const cy = (1 - item.y) * view.size.height;
  const box = form.createCheckBox(freeName(pdf, "check"));
  box.addToPage(page, { ...pageBox(page, cx - item.size / 2, cy - item.size / 2, item.size, item.size), ...border });
  box.check();
}

/**
 * The PDF with the items written on it: into the pages, or as fillable fields (text fields for
 * text, ticked boxes for marks) when `asFields` is set.
 */
export async function writeOnPdf(bytes: Uint8Array, items: WrittenItem[], { asFields = false }: { asFields?: boolean } = {}): Promise<Uint8Array> {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pictures = new Map<WrittenText, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  for (const item of items) {
    if (!pages[item.page]) throw new RangeError(`There is no page ${item.page + 1}`);
    if (item.kind === "text" && item.picture && !asFields) pictures.set(item, await pdf.embedPng(item.picture.png));
  }
  for (const item of items) {
    const page = pages[item.page];
    if (item.kind === "text" && !item.text.trim()) continue;
    if (asFields) addFields(pdf, page, item, font);
    else if (item.kind === "text") {
      if (!item.picture && !writable(font, item.text)) throw new Error("needsPicture");
      drawText(page, item, font, pictures);
    } else drawMark(page, item);
  }
  return pdf.save({ updateFieldAppearances: false });
}
