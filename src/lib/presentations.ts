/**
 * Presentations: sales decks put together from the company's own PowerPoint slides. An admin
 * keeps a library of master decks; salespeople pick slides from them, fill in who the deck is
 * for, add slides of their own, and download PowerPoint or PDF.
 */

export const DECK_CATEGORIES = ["generic", "medical", "engineering"] as const;
export type DeckCategory = (typeof DECK_CATEGORIES)[number];

/** A slide of a library deck, by the id PowerPoint keeps for it across edits. */
export type LibrarySlide = {
  id: number;
  title: string;
  /** Hidden in the deck itself; still offered, and shown when chosen. */
  hidden: boolean;
  /** Chosen to start with when a presentation is made from this deck. */
  default: boolean;
};

/** One slide of a presentation, in order. `key` tells items apart while they are moved about. */
export type PresentationItem =
  | { key: string; type: "cover" }
  | { key: string; type: "slide"; deckId: number; slideId: number }
  | { key: string; type: "text"; title: string; body: string; imageKey: string | null };

/** Library decks are refused above this size. */
export const MAX_DECK_BYTES = 100 * 1024 * 1024;

/** A presentation holds at most this many slides. */
export const MAX_ITEMS = 150;

/** The cover's colour when the deck gives none: the company blue. */
export const DEFAULT_DECK_COLOR = "0047BA";

/** Whether white text reads on a colour (hex without the #); else dark text is used. */
export function isDark(color: string) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.36;
}
