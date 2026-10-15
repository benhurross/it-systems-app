import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import type { LabelDpi, LabelSize } from "./label-sizes";

/**
 * Asset tags for a Zebra label printer: a QR code that opens the asset in the app, a Code 128
 * barcode of its number for a handheld scanner, its number large, and its name. Each tag is laid
 * out once, in printer dots, as boxes and lines of text; the same layout is written as ZPL (the
 * printer's own language, sent to it over the network or as a file) and as a PDF the size of the
 * label (for a printer on a computer, through its driver), so both print the same.
 */


export type AssetLabel = { ref: string; name: string; serial: string | null; link: string; owner: string };

/** Something on a label, in dots from its top left: a filled box, or a line of text `height` dots tall. */
export type Mark =
  | { kind: "box"; x: number; y: number; width: number; height: number }
  | { kind: "text"; x: number; y: number; height: number; width: number; text: string; bold: boolean };
export type LabelLayout = { width: number; height: number; dpi: LabelDpi; marks: Mark[] };

// ---------------------------------------------------------------- Code 128

/** The bar and space widths of each Code 128 symbol, 0 to 106 (106 is Stop). */
const CODE128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");
const START_B = 104;
const START_C = 105;
const TO_B = 100;
const TO_C = 99;
const STOP = 106;

/** The symbols for printable ASCII text: set B for letters, set C (two digits a symbol) for runs of digits. */
export function code128Symbols(text: string): number[] {
  if (!/^[\x20-\x7e]*$/.test(text)) throw new Error("Code 128 here takes printable ASCII only");
  const digitsFrom = (i: number) => {
    let j = i;
    while (j < text.length && text[j] >= "0" && text[j] <= "9") j++;
    return j - i;
  };
  const symbols: number[] = [];
  let set: "B" | "C";
  let i = 0;
  const lead = digitsFrom(0);
  if (lead >= 4 && (lead === text.length || lead >= 6)) {
    set = "C";
    symbols.push(START_C);
  } else {
    set = "B";
    symbols.push(START_B);
  }
  while (i < text.length) {
    if (set === "C") {
      if (digitsFrom(i) >= 2) {
        symbols.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      symbols.push(TO_B);
      set = "B";
    }
    const run = digitsFrom(i);
    // Digits pack two to a symbol, worth switching for four at the end or six in the middle.
    if ((run >= 4 && i + run === text.length) || run >= 6) {
      if (run % 2 === 1) {
        symbols.push(text.charCodeAt(i) - 32);
        i++;
      }
      symbols.push(TO_C);
      set = "C";
      continue;
    }
    symbols.push(text.charCodeAt(i) - 32);
    i++;
  }
  const check = symbols.reduce((sum, s, k) => sum + s * Math.max(k, 1), 0) % 103;
  return [...symbols, check, STOP];
}

/** A barcode's widths in modules, bar first and then alternating: the Stop symbol ends on a bar. */
export function code128(text: string): number[] {
  return code128Symbols(text).flatMap((s) => [...CODE128[s]].map(Number));
}

// ---------------------------------------------------------------- layout

/** The text a printer's built-in font can show: printable ASCII, with ^ and ~ (ZPL's own) left out. */
export const printable = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\^~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Roughly how wide a line of text is, in dots, at `height` dots tall: enough to cut it short in time. */
function textWidth(text: string, height: number) {
  let em = 0;
  for (const c of text) em += /[A-Z0-9#%&@MW]/.test(c) ? 0.62 : /[ .,:;'!|il1\-]/.test(c) ? 0.3 : 0.54;
  return em * height;
}

/** The text, cut short with an ellipsis if it would be wider than `width`. */
export function fitText(text: string, height: number, width: number) {
  if (textWidth(text, height) <= width) return text;
  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}...`, height) > width) cut = cut.slice(0, -1).trimEnd();
  return `${cut}...`;
}

/** A QR code as boxes, a box for each run of dark modules along a row. */
function qrBoxes(link: string, x: number, y: number, cell: number): Mark[] {
  const { modules } = QRCode.create(link, { errorCorrectionLevel: "M" });
  const boxes: Mark[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; ) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      let end = col;
      while (end < modules.size && modules.get(row, end)) end++;
      boxes.push({ kind: "box", x: x + col * cell, y: y + row * cell, width: (end - col) * cell, height: cell });
      col = end;
    }
  }
  return boxes;
}

const qrModules = (link: string) => QRCode.create(link, { errorCorrectionLevel: "M" }).modules.size;

/**
 * A tag laid out on a label of the given size: the QR code on the left, the owner's name, the
 * asset number, its name and serial beside it, and the barcode across the foot.
 */
export function layoutLabel(label: AssetLabel, size: LabelSize): LabelLayout {
  const dots = (mm: number) => Math.round((mm * size.dpi) / 25.4);
  const width = dots(size.widthMm);
  const height = dots(size.heightMm);
  const margin = dots(1.5);
  const marks: Mark[] = [];

  // The barcode, with the quiet space either side a scanner needs (ten modules) inside the label.
  const pattern = code128(printable(label.ref));
  const modules = pattern.reduce((a, b) => a + b, 0);
  const moduleWidth = Math.max(1, Math.min(4, Math.floor(width / (modules + 20))));
  const barHeight = Math.max(dots(5), Math.round(height * 0.24));
  const barTop = height - margin - barHeight;
  let x = Math.round((width - modules * moduleWidth) / 2);
  pattern.forEach((w, i) => {
    if (i % 2 === 0) marks.push({ kind: "box", x, y: barTop, width: w * moduleWidth, height: barHeight });
    x += w * moduleWidth;
  });

  // The QR code fills the height above the barcode.
  const top = margin;
  const area = barTop - dots(1) - top;
  const qrSize = qrModules(label.link);
  const qrModule = Math.max(1, Math.floor(area / qrSize));
  marks.push(...qrBoxes(label.link, margin, top, qrModule));

  // The words beside it, as many lines as fit: the asset number always.
  const textX = margin + qrSize * qrModule + dots(2);
  const textWidthDots = width - margin - textX;
  const scale = Math.min(1, area / dots(15));
  const lines = [
    { text: printable(label.owner), height: Math.round(dots(2.4) * scale), bold: false },
    { text: printable(label.ref), height: Math.round(dots(4.6) * scale), bold: true, whole: true },
    { text: printable(label.name), height: Math.round(dots(2.8) * scale), bold: false },
    { text: label.serial ? `S/N ${printable(label.serial)}` : "", height: Math.round(dots(2.4) * scale), bold: false },
  ];
  const gap = Math.round(dots(0.8) * scale);
  let y = top;
  for (const line of lines) {
    if (!line.text || y + line.height > top + area) continue;
    // The asset number is made smaller to fit rather than cut short.
    const lineHeight = "whole" in line ? Math.min(line.height, Math.floor((line.height * textWidthDots) / textWidth(line.text, line.height))) : line.height;
    const text = "whole" in line ? line.text : fitText(line.text, lineHeight, textWidthDots);
    marks.push({ kind: "text", x: textX, y, height: lineHeight, width: textWidthDots, text, bold: line.bold });
    y += lineHeight + gap;
  }
  return { width, height, dpi: size.dpi, marks };
}

// ---------------------------------------------------------------- ZPL and PDF

/** The labels in ZPL, each printed `copies` times. */
export function toZpl(layouts: LabelLayout[], copies = 1): string {
  return layouts
    .map((label) => {
      const fields = label.marks.map((m) =>
        m.kind === "box"
          ? `^FO${m.x},${m.y}^GB${m.width},${m.height},${Math.min(m.width, m.height)}^FS`
          : `^FO${m.x},${m.y}^A0N,${m.height},${Math.round(m.height * (m.bold ? 0.95 : 0.85))}^FD${m.text}^FS`,
      );
      return ["^XA", "^CI28", `^PW${label.width}`, `^LL${label.height}`, "^LH0,0", ...fields, `^PQ${copies}`, "^XZ"].join("\n");
    })
    .join("\n");
}

/** The labels as a PDF, a page the size of the label for each, `copies` times over. */
export async function toPdf(layouts: LabelLayout[], copies = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Asset tags");
  pdf.setCreator("AP Plus IT Systems");
  pdf.setProducer("AP Plus IT Systems");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const label of layouts) {
    const pt = (d: number) => (d * 72) / label.dpi;
    for (let n = 0; n < copies; n++) {
      const page = pdf.addPage([pt(label.width), pt(label.height)]);
      const top = pt(label.height);
      for (const m of label.marks) {
        if (m.kind === "box") {
          page.drawRectangle({ x: pt(m.x), y: top - pt(m.y + m.height), width: pt(m.width), height: pt(m.height), color: rgb(0, 0, 0) });
          continue;
        }
        const font = m.bold ? bold : regular;
        // Sized so its capitals stand as tall as the printer's; narrowed to fit if it is wider.
        let size = pt(m.height) * 0.95;
        const room = pt(m.width);
        const wide = font.widthOfTextAtSize(m.text, size);
        if (wide > room) size *= room / wide;
        page.drawText(m.text, { x: pt(m.x), y: top - pt(m.y) - font.heightAtSize(size, { descender: false }), size, font, color: rgb(0, 0, 0) });
      }
    }
  }
  return pdf.save();
}
