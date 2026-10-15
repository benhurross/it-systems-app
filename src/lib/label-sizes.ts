/**
 * Label sizes and printer resolutions for asset tags, apart from the code that draws the tags so
 * that forms can offer them without loading it.
 */

/** The label sizes on offer, in millimetres. 50 × 25 is the usual asset tag. */
export const LABEL_SIZES = {
  "50x25": { widthMm: 50, heightMm: 25 },
  "38x25": { widthMm: 38, heightMm: 25 },
  "76x51": { widthMm: 76, heightMm: 51 },
} as const;
export const LABEL_DPIS = [203, 300] as const;
export type LabelDpi = (typeof LABEL_DPIS)[number];
export type LabelSize = { widthMm: number; heightMm: number; dpi: LabelDpi };
