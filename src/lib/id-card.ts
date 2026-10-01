/**
 * The ID card: its size, where the photo and text go on the company design, and how text is
 * fitted. Shared by the live preview (measuring with the browser) and the printed PDF (measuring
 * with the embedded fonts), so both place the same lines. Units are points (1/72 inch).
 */

/** CR80, the standard card size, portrait: 54 × 85.6 mm. */
export const CARD = { width: 153, height: 243 } as const;

export const CARD_SIDES = ["front", "back"] as const;
export type CardSide = (typeof CARD_SIDES)[number];

/**
 * Pixels needed across the photo window to print it sharp at the card printer's 300 dpi, and
 * the size the arranged photo is saved at. Designs need about 640 pixels across for the same.
 */
export const PHOTO_PIXELS = { needed: 340, saved: 600 } as const;
export const DESIGN_MIN_WIDTH = 600;

/** The white photo window in the design, with its rounded corners. */
export const PHOTO = { x: 46.95, y: 69.2, size: 82, radius: 11.2 } as const;

/** Text is centred on the photo, not the card (the design has a banner down the left), and is
 * never wider than the blue line under the name, so it cannot reach the banner. */
export const TEXT = { centre: PHOTO.x + PHOTO.size / 2, maxWidth: 95 } as const;

/** Where the lines sit: the name just above the blue line (stacking upwards when it wraps), the
 * designation just below it, and the ID number after the designation. */
const NAME_BASELINE = 177.5;
const DESIGNATION_BASELINE = 191.5;
const LINE_GAP = 1.5;
const ID_GAP = 5;

export const CARD_FONTS = ["regular", "narrow"] as const;
export type CardFont = (typeof CARD_FONTS)[number];
export type FontChoice = "auto" | CardFont;

/** Default, smallest and largest sizes; auto fitting only goes down from the default. */
export const SIZES = {
  name: { default: 8, min: 6, max: 10 },
  designation: { default: 7.5, min: 5.5, max: 9 },
  number: { default: 8.5, min: 6, max: 8.5 },
} as const;
export const SIZE_STEP = 0.5;
/** Auto fitting stops shrinking here, before switching font or wrapping. */
const AUTO_FLOOR = { name: 6.5, designation: 6 } as const;

/** Width of `text` in points, in a card font, bold or not, at `size` points. */
export type Measure = (text: string, font: CardFont, bold: boolean, size: number) => number;

export type Line = { kind: "name" | "designation" | "number"; text: string; font: CardFont; bold: boolean; size: number; y: number };

/** The font and size a block of text ended up in, for showing beside its controls. */
export const blockOf = (lines: Line[] | null, kind: Line["kind"]) => lines?.find((l) => l.kind === kind) ?? null;

export type CardText = {
  name: string;
  designation: string;
  number: string | null;
  nameFont: FontChoice;
  nameSize: number | null;
  designationFont: FontChoice;
  designationSize: number | null;
};

type Block = { lines: string[]; font: CardFont; size: number };

/**
 * Fits one block of text within the width. With a font chosen it keeps that font; with a size
 * chosen it starts there. Otherwise the regular font is tried from the default size down to the
 * floor, then the narrow one. Whatever the choice, text that still does not fit shrinks to the
 * smallest size, then wraps onto two lines at the best word break.
 */
function fit(text: string, bold: boolean, choice: FontChoice, size: number | null, kind: "name" | "designation", measure: Measure): Block {
  const limits = SIZES[kind];
  const start = Math.min(Math.max(size ?? limits.default, limits.min), limits.max);
  const fonts: CardFont[] = choice === "auto" ? ["regular", "narrow"] : [choice];
  const floor = size === null && choice === "auto" ? AUTO_FLOOR[kind] : start;
  const fits = (t: string, font: CardFont, s: number) => measure(t, font, bold, s) <= TEXT.maxWidth;
  const steps = (from: number, to: number) => {
    const out: number[] = [];
    for (let s = from; s >= to - 1e-9; s -= 0.25) out.push(Math.round(s * 100) / 100);
    return out;
  };

  for (const font of fonts) for (const s of steps(start, floor)) if (fits(text, font, s)) return { lines: [text], font, size: s };
  const last = fonts[fonts.length - 1];
  for (const s of steps(floor, limits.min)) if (fits(text, last, s)) return { lines: [text], font: last, size: s };

  const words = text.split(/\s+/).filter(Boolean);
  for (const s of steps(start, limits.min)) {
    // The break that leaves the two lines most even.
    const breaks = words
      .slice(1)
      .map((_, i) => [words.slice(0, i + 1).join(" "), words.slice(i + 1).join(" ")] as const)
      .filter(([a, b]) => fits(a, last, s) && fits(b, last, s))
      .sort(([a1, b1], [a2, b2]) => Math.abs(a1.length - b1.length) - Math.abs(a2.length - b2.length));
    if (breaks.length) return { lines: [...breaks[0]], font: last, size: s };
  }
  return { lines: [text], font: last, size: limits.min };
}

/** Every line of text on the card's front, fitted and placed. */
export function layoutCard(card: CardText, measure: Measure): Line[] {
  const lines: Line[] = [];
  const name = fit(card.name.trim(), true, card.nameFont, card.nameSize, "name", measure);
  name.lines.forEach((text, i) => {
    const fromBottom = name.lines.length - 1 - i;
    lines.push({ kind: "name", text, font: name.font, bold: true, size: name.size, y: NAME_BASELINE - fromBottom * (name.size + LINE_GAP) });
  });

  let y = DESIGNATION_BASELINE;
  let lastSize = 0;
  if (card.designation.trim()) {
    const designation = fit(card.designation.trim(), false, card.designationFont, card.designationSize, "designation", measure);
    designation.lines.forEach((text, i) => {
      y = DESIGNATION_BASELINE + i * (designation.size + LINE_GAP);
      lines.push({ kind: "designation", text, font: designation.font, bold: false, size: designation.size, y });
    });
    lastSize = designation.size;
  }

  if (card.number) {
    const text = `ID: ${card.number}`;
    let size: number = SIZES.number.default;
    while (size > SIZES.number.min && measure(text, "regular", true, size) > TEXT.maxWidth) size -= 0.25;
    lines.push({ kind: "number", text, font: "regular", bold: true, size, y: y + lastSize + LINE_GAP + ID_GAP });
  }
  return lines;
}

/** The name without the middle ones: "Mohammed Abdulrahman Al-Ghamdi" becomes "Mohammed Al-Ghamdi". */
export function firstAndLast(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length <= 2 ? words.join(" ") : `${words[0]} ${words[words.length - 1]}`;
}

/** The files the card fonts are served from, for the browser and for the PDF. */
export const FONT_FILES: Record<CardFont, Record<"regular" | "bold", string>> = {
  regular: { regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf" },
  narrow: { regular: "RobotoCondensed-Regular.ttf", bold: "RobotoCondensed-Bold.ttf" },
};
