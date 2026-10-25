import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

/** An outlet as a made-up plan draws it: its P label over its S label, at a point from the page's top left. */
export type DrawnOutlet = { p?: string; s?: string; x: number; y: number };

/**
 * A made-up floor plan, A4 like the office's: walls, room names (one running up the page), small
 * wall marks that are not outlets, and the outlets' labels in 3-point text, P over S.
 */
export async function floorPlanPdf(outlets: DrawnOutlet[]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.32, 841.92]);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const h = page.getHeight();
  const walls = rgb(0, 0, 0);
  page.drawRectangle({ x: 150, y: h - 700, width: 300, height: 600, borderColor: walls, borderWidth: 1 });
  page.drawLine({ start: { x: 150, y: h - 400 }, end: { x: 450, y: h - 400 }, color: walls, thickness: 1 });
  page.drawText("MEETING ROOM", { x: 260, y: h - 150, size: 4, font });
  page.drawText("SERVER", { x: 160, y: h - 600, size: 4, font, rotate: degrees(90) });
  page.drawText("S2", { x: 155, y: h - 300, size: 1.8, font });
  for (const o of outlets) {
    if (o.p) page.drawText(o.p, { x: o.x, y: h - o.y, size: 3, font, color: rgb(0.25, 0.3, 0.9) });
    if (o.s) page.drawText(o.s, { x: o.x, y: h - o.y - 3.6, size: 3, font, color: rgb(0.25, 0.3, 0.9) });
  }
  return pdf.save();
}
