import { degrees, rgb, StandardFonts } from "pdf-lib";
import { asShown } from "./pdf-geometry";
import { isStampText, loadPdf } from "./pdf-tools";

/**
 * Signing a PDF in the browser: a picture of the person's signature (drawn, typed or a scan,
 * always made a PNG first) put where they place it, on one page or several, with the date under
 * it if they want. This is a signature as on paper, not a certified digital signature.
 */

/** A signature's box on a page (from 0), in fractions of the page as shown, from its top left. */
export type SignPlacement = { page: number; x: number; y: number; width: number; height: number };

/** The share of the box the date takes, under the signature, when there is one. */
export const DATE_SHARE = 0.24;

export async function signPdf(bytes: Uint8Array, signature: Uint8Array, placements: SignPlacement[], date: string | null): Promise<Uint8Array> {
  if (date !== null && (!date.trim() || !isStampText(date))) throw new Error("date");
  const pdf = await loadPdf(bytes);
  const image = await pdf.embedPng(signature);
  const font = date !== null ? await pdf.embedFont(StandardFonts.Helvetica) : null;
  const pages = pdf.getPages();

  for (const place of placements) {
    const page = pages[place.page];
    if (!page) throw new RangeError(`There is no page ${place.page + 1}`);
    const view = asShown(page);
    const rotate = degrees(view.rotation);
    // The box as shown, from its bottom left, in points.
    const width = place.width * view.size.width;
    const height = place.height * view.size.height;
    const left = place.x * view.size.width;
    const bottom = view.size.height * (1 - place.y) - height;
    const dateHeight = font ? height * DATE_SHARE : 0;

    // The signature as large as fits above the date, centred, standing on the line.
    const room = height - dateHeight;
    const scale = Math.min(width / image.width, room / image.height);
    const shownWidth = image.width * scale;
    page.drawImage(image, { ...view.point(left + (width - shownWidth) / 2, bottom + dateHeight), width: shownWidth, height: image.height * scale, rotate });

    if (font && date) {
      let size = dateHeight * 0.7;
      const wide = font.widthOfTextAtSize(date, size);
      if (wide > width) size *= width / wide;
      const textWidth = font.widthOfTextAtSize(date, size);
      page.drawText(date, { ...view.point(left + (width - textWidth) / 2, bottom + dateHeight * 0.2), size, font, color: rgb(0.1, 0.1, 0.1), rotate });
    }
  }
  return pdf.save();
}
