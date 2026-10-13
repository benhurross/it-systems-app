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
  | { key: string; type: "contents"; title: string }
  | { key: string; type: "slide"; deckId: number; slideId: number }
  | { key: string; type: "text"; title: string; body: string; imageKey: string | null };

/** The contents slide's heading until it is changed. */
export const DEFAULT_CONTENTS_TITLE = "Contents";

/** Where a deck's slides show their number. */
export const NUMBER_POSITIONS = ["bottom-left", "bottom-right", "bottom-center"] as const;
export type NumberPosition = (typeof NUMBER_POSITIONS)[number];

/** A slide as the contents sees it: what kind it is, and its title. */
export type OutlineSlide = { kind: PresentationItem["type"]; title: string };
export type ContentsEntry = { title: string; page: number };

/**
 * The lines of the contents slide at `at` (from 0): each titled slide after it, with its slide
 * number (the cover is slide 1). The cover and contents slides are left out, and a title the
 * slides straight after repeat ("Impact on business" three times) is listed once.
 */
export function contentsEntries(slides: OutlineSlide[], at: number): ContentsEntry[] {
  const entries: ContentsEntry[] = [];
  for (let i = at + 1; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.kind === "cover" || slide.kind === "contents") continue;
    const title = slide.title.replace(/\s+/g, " ").trim();
    if (!title || entries.at(-1)?.title.toLowerCase() === title.toLowerCase()) continue;
    entries.push({ title, page: i + 1 });
  }
  return entries;
}

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
