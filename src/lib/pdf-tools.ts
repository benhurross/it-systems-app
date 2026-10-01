import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/**
 * The work behind the PDF tools. Everything here runs in the person's browser, so their files
 * never leave their computer; the same code runs in tests.
 */

export type PdfProblem = "notPdf" | "encrypted" | "damaged";

/** Why a file could not be used, for the page to say in the reader's language. */
export class PdfToolError extends Error {
  constructor(readonly problem: PdfProblem) {
    super(problem);
  }
}

const isPdf = (bytes: Uint8Array) => bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  if (!isPdf(bytes)) throw new PdfToolError("notPdf");
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    throw new PdfToolError(/encrypt/i.test(String((error as Error)?.message ?? error)) ? "encrypted" : "damaged");
  }
}

async function fresh() {
  const pdf = await PDFDocument.create();
  pdf.setCreator("AP Plus IT Systems");
  pdf.setProducer("AP Plus IT Systems");
  return pdf;
}

/** One PDF of all the files' pages, in the order given. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await fresh();
  for (const bytes of files) {
    const source = await loadPdf(bytes);
    for (const page of await out.copyPages(source, source.getPageIndices())) out.addPage(page);
  }
  return out.save();
}

/**
 * Pages written as people write them, "1-3, 5, 8-", into groups of page indexes (from 0). Null
 * when a part is not a page or range within 1 to `pageCount`.
 */
export function parsePageRanges(text: string, pageCount: number): number[][] | null {
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const groups: number[][] = [];
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d*))?$/.exec(part.replace(/[–—]/g, "-"));
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === "" ? pageCount : Number(m[2]);
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) return null;
    const [a, b] = from <= to ? [from, to] : [to, from];
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
  }
  return groups;
}

/** Page indexes (from 0) written back as ranges: [0, 1, 2, 4] is "1-3, 5". */
export function formatPageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** A PDF of the given pages, in the order given. */
export async function extractPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
  const source = await loadPdf(bytes);
  const out = await fresh();
  for (const page of await out.copyPages(source, pages)) out.addPage(page);
  return out.save();
}

/** A PDF for each group of pages. */
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const source = await loadPdf(bytes);
  const outs: Uint8Array[] = [];
  for (const group of groups) {
    const out = await fresh();
    for (const page of await out.copyPages(source, group)) out.addPage(page);
    outs.push(await out.save());
  }
  return outs;
}

/** The pages in a new order, each turned by a quarter turn or more (clockwise, as shown). */
export async function organizePdf(bytes: Uint8Array, pages: { index: number; turn: number }[]): Promise<Uint8Array> {
  const source = await loadPdf(bytes);
  const out = await fresh();
  const copied = await out.copyPages(
    source,
    pages.map((p) => p.index),
  );
  copied.forEach((page, i) => {
    page.setRotation(degrees((((page.getRotation().angle + pages[i].turn) % 360) + 360) % 360));
    out.addPage(page);
  });
  return out.save();
}

// ---------------------------------------------------------------- images to PDF

export type PdfImage = { bytes: Uint8Array; type: "image/png" | "image/jpeg"; width: number; height: number };
export type ImagePageOptions = { size: "a4" | "fit"; orientation: "auto" | "portrait" | "landscape"; margin: number };

const A4 = { width: 595.28, height: 841.89 };

/** What kind of image the bytes are, by their first bytes rather than the file's name. */
export function imageKind(bytes: Uint8Array): PdfImage["type"] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/**
 * How a JPEG says it should be turned to stand upright (its EXIF orientation, 1 to 8); 1, as it
 * is, when it says nothing. Phones save photos sideways and set this instead of turning them.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    // Past the headers, or not a marker: there is no orientation.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1;
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 18 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

/** A page for each image, the image as large as it fits without stretching. */
export async function imagesToPdf(images: PdfImage[], options: ImagePageOptions): Promise<Uint8Array> {
  const out = await fresh();
  for (const img of images) {
    const embedded = img.type === "image/png" ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
    const wide = img.width > img.height;
    let pageW: number;
    let pageH: number;
    if (options.size === "fit") {
      // 96 pixels to the inch, as screens and phones measure images.
      pageW = (img.width * 72) / 96 + options.margin * 2;
      pageH = (img.height * 72) / 96 + options.margin * 2;
    } else {
      const landscape = options.orientation === "landscape" || (options.orientation === "auto" && wide);
      [pageW, pageH] = landscape ? [A4.height, A4.width] : [A4.width, A4.height];
    }
    const page = out.addPage([pageW, pageH]);
    const room = { width: pageW - options.margin * 2, height: pageH - options.margin * 2 };
    const scale = Math.min(room.width / img.width, room.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }
  return out.save();
}

// ---------------------------------------------------------------- page numbers and watermark

export const NUMBER_POSITIONS = ["bottomCenter", "bottomRight", "bottomLeft", "topCenter", "topRight", "topLeft"] as const;
export const NUMBER_STYLES = ["plain", "pageOf", "slash"] as const;
export type StampOptions = {
  numbers: { position: (typeof NUMBER_POSITIONS)[number]; style: (typeof NUMBER_STYLES)[number]; start: number; size: number } | null;
  watermark: { text: string; opacity: number; size: number } | null;
};

/** Text the standard PDF fonts can write: printable Latin letters, digits and punctuation. */
export const isStampText = (text: string) => /^[\x20-\x7E]*$/.test(text);

export function pageLabel(style: (typeof NUMBER_STYLES)[number], n: number, total: number): string {
  if (style === "pageOf") return `Page ${n} of ${total}`;
  if (style === "slash") return `${n} / ${total}`;
  return `${n}`;
}

/**
 * Where a point as the page is shown lands in the page's own coordinates, and the angle that
 * reads level as shown: a page saved turned (90, 180 or 270) is drawn on unturned.
 */
function shown(page: PDFPage) {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const { width: W, height: H } = page.getSize();
  const turned = rotation === 90 || rotation === 270;
  const size = turned ? { width: H, height: W } : { width: W, height: H };
  const point = (dx: number, dy: number) => {
    if (rotation === 90) return { x: W - dy, y: dx };
    if (rotation === 180) return { x: W - dx, y: H - dy };
    if (rotation === 270) return { x: dy, y: H - dx };
    return { x: dx, y: dy };
  };
  return { size, point, angle: rotation };
}

/** Text placed with its centre at (cx, cy) as shown, turned `tilt` degrees as shown. */
function drawCentred(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, cy: number, tilt: number, opacity: number, color = rgb(0.2, 0.2, 0.2)) {
  const view = shown(page);
  const width = font.widthOfTextAtSize(text, size);
  const height = font.heightAtSize(size, { descender: false });
  const angle = ((tilt + view.angle) * Math.PI) / 180;
  const tiltRad = (tilt * Math.PI) / 180;
  // The text's origin, back from its centre along its own direction, as shown.
  const ox = cx - (width / 2) * Math.cos(tiltRad) + (height / 2) * Math.sin(tiltRad);
  const oy = cy - (width / 2) * Math.sin(tiltRad) - (height / 2) * Math.cos(tiltRad);
  const { x, y } = view.point(ox, oy);
  page.drawText(text, { x, y, size, font, color, opacity, rotate: degrees((angle * 180) / Math.PI) });
}

/**
 * Page numbers and a watermark on every page, placed as each page is shown. `total` counts the
 * pages for "of 10" when these are only some of them, as in a preview of the first.
 */
export async function stampPdf(bytes: Uint8Array, options: StampOptions, total?: number): Promise<Uint8Array> {
  const pdf = await loadPdf(bytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { size } = shown(page);
    if (options.watermark && options.watermark.text.trim()) {
      const diagonal = (Math.atan2(size.height, size.width) * 180) / Math.PI;
      // As large as asked, but never wider than the page's diagonal.
      const text = options.watermark.text.trim();
      const room = Math.hypot(size.width, size.height) * 0.8;
      const fontSize = Math.min(options.watermark.size, (options.watermark.size * room) / bold.widthOfTextAtSize(text, options.watermark.size));
      drawCentred(page, text, bold, fontSize, size.width / 2, size.height / 2, diagonal, options.watermark.opacity, rgb(0.5, 0.5, 0.5));
    }
    if (options.numbers) {
      const n = options.numbers;
      const label = pageLabel(n.style, n.start + i, n.start + (total ?? pages.length) - 1);
      const margin = 24;
      const width = regular.widthOfTextAtSize(label, n.size);
      const cx = n.position.endsWith("Left") ? margin + width / 2 : n.position.endsWith("Right") ? size.width - margin - width / 2 : size.width / 2;
      const cy = n.position.startsWith("top") ? size.height - margin : margin;
      drawCentred(page, label, regular, n.size, cx, cy, 0, 1);
    }
  });
  return pdf.save();
}
