import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  PDFDocument,
  type PDFFont,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "pdf-lib";
import { CARD, CARD_FONTS, type CardFont, type CardText, FONT_FILES, layoutCard, PHOTO, TEXT } from "@/lib/id-card";

type Image = { bytes: Uint8Array; type: string };

// The same font files the browser uses for the preview, so both fit text alike.
const fontFiles = new Map<string, Promise<Buffer>>();
function fontBytes(file: string) {
  if (!fontFiles.has(file)) {
    fontFiles.set(file, readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "id-card", file)));
  }
  return fontFiles.get(file)!;
}

async function embed(pdf: PDFDocument, image: Image) {
  return image.type === "image/png" ? pdf.embedPng(image.bytes) : pdf.embedJpg(image.bytes);
}

/** A rounded square path, in PDF coordinates (origin bottom left), for clipping the photo. */
function roundedSquare(x: number, y: number, size: number, r: number) {
  const k = r * 0.5523; // control point distance for a quarter circle
  const [x1, y1] = [x + size, y + size];
  return [
    moveTo(x + r, y),
    lineTo(x1 - r, y),
    appendBezierCurve(x1 - r + k, y, x1, y + r - k, x1, y + r),
    lineTo(x1, y1 - r),
    appendBezierCurve(x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1),
    lineTo(x + r, y1),
    appendBezierCurve(x + r - k, y1, x, y1 - r + k, x, y1 - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
  ];
}

/**
 * One side of the card as a one-page PDF at exact card size, to print on the card printer at
 * actual size. The front carries the photo and the fitted text over the design; the back is the
 * design alone. Without a design, the page is plain white.
 */
export async function cardPdf(side: "front" | "back", card: CardText & { title: string }, design: Image | null, photo: Image | null) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${card.title} (${side})`);
  pdf.setCreator("AP Plus IT Systems");
  const page = pdf.addPage([CARD.width, CARD.height]);
  if (design) page.drawImage(await embed(pdf, design), { x: 0, y: 0, width: CARD.width, height: CARD.height });
  if (side === "back") return pdf.save();

  if (photo) {
    const image = await embed(pdf, photo);
    const y = CARD.height - PHOTO.y - PHOTO.size;
    page.pushOperators(pushGraphicsState(), ...roundedSquare(PHOTO.x, y, PHOTO.size, PHOTO.radius), clip(), endPath());
    page.drawImage(image, { x: PHOTO.x, y, width: PHOTO.size, height: PHOTO.size });
    page.pushOperators(popGraphicsState());
  }

  const fonts = {} as Record<CardFont, Record<"regular" | "bold", PDFFont>>;
  for (const font of CARD_FONTS) {
    fonts[font] = {
      regular: await pdf.embedFont(await fontBytes(FONT_FILES[font].regular), { subset: true }),
      bold: await pdf.embedFont(await fontBytes(FONT_FILES[font].bold), { subset: true }),
    };
  }
  const pick = (font: CardFont, bold: boolean) => fonts[font][bold ? "bold" : "regular"];
  const colour = rgb(0x23 / 255, 0x1f / 255, 0x20 / 255); // the design's text colour
  for (const line of layoutCard(card, (text, font, bold, size) => pick(font, bold).widthOfTextAtSize(text, size))) {
    const font = pick(line.font, line.bold);
    const width = font.widthOfTextAtSize(line.text, line.size);
    page.drawText(line.text, { x: TEXT.centre - width / 2, y: CARD.height - line.y, size: line.size, font, color: colour });
  }
  return pdf.save();
}

/** Widths as the PDF measures them, for checking layouts in tests. */
export async function pdfMeasure() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {} as Record<string, PDFFont>;
  for (const font of CARD_FONTS) {
    for (const weight of ["regular", "bold"] as const) fonts[`${font}-${weight}`] = await pdf.embedFont(await fontBytes(FONT_FILES[font][weight]));
  }
  return (text: string, font: CardFont, bold: boolean, size: number) => fonts[`${font}-${bold ? "bold" : "regular"}`].widthOfTextAtSize(text, size);
}
