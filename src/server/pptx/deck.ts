import { Package, relKind, resolveTarget, unescapeXml } from "./package";

/** PowerPoint's units: English Metric Units, 914400 to the inch. */
export const EMU_PER_INCH = 914400;

export type SlideRef = { id: number; relId: string; part: string };

/** The slides in the order they are shown, by the id PowerPoint keeps for each across edits. */
export function slideRefs(pkg: Package): SlideRef[] {
  const xml = pkg.text("ppt/presentation.xml");
  const list = xml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/)?.[1] ?? "";
  const rels = new Map(pkg.rels("ppt/presentation.xml").map((r) => [r.id, r]));
  return [...list.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"[^>]*\br:id="([^"]+)"[^>]*\/?>|<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\bid="(\d+)"[^>]*\/?>/g)].map((m) => {
    const id = Number(m[1] ?? m[4]);
    const relId = m[2] ?? m[3];
    const rel = rels.get(relId);
    if (!rel) throw new Error("brokenDeck");
    return { id, relId, part: resolveTarget("ppt/presentation.xml", rel.target) };
  });
}

/** The slide size, in EMU. */
export function slideSize(pkg: Package) {
  const m = pkg.text("ppt/presentation.xml").match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : { cx: 12192000, cy: 6858000 };
}

export type Shape = { xml: string; start: number; text: string; y: number; placeholder: string | null };

/** The text paragraphs of a piece of slide XML. */
export function paragraphs(xml: string) {
  return [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g)].map(([p]) =>
    unescapeXml([...p.matchAll(/<a:t>([^<]*)<\/a:t>|<a:t\b[^>]*>([^<]*)<\/a:t>/g)].map((t) => t[1] ?? t[2]).join("")),
  );
}

/** Every shape with text on a slide, and where it sits. */
export function textShapes(xml: string): Shape[] {
  return [...xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)]
    .map((m) => {
      const shape = m[0];
      const text = paragraphs(shape)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
      return {
        xml: shape,
        start: m.index!,
        text,
        y: Number(shape.match(/<a:off\b[^>]*\by="(-?\d+)"/)?.[1] ?? 0),
        placeholder: shape.match(/<p:ph\b[^>]*\btype="([^"]+)"/)?.[1] ?? null,
      };
    })
    .filter((s) => s.text);
}

/**
 * The shape that titles a slide: its title placeholder if it has one. Otherwise, of the short
 * text in the top quarter (page numbers aside), the topmost bold text, else the topmost text;
 * failing that, the topmost text anywhere.
 */
export function titleShape(xml: string, height: number): Shape | null {
  const shapes = textShapes(xml).filter((s) => !/^\d{1,3}$/.test(s.text));
  const placeholder = shapes.find((s) => s.placeholder === "title" || s.placeholder === "ctrTitle");
  if (placeholder) return placeholder;
  const topmost = (list: Shape[]) => list.reduce<Shape | null>((a, b) => (!a || b.y < a.y ? b : a), null);
  const top = shapes.filter((s) => s.y < height / 4 && s.text.length <= 80);
  return topmost(top.filter((s) => /<a:rPr\b[^>]*\sb="1"/.test(s.xml))) ?? topmost(top) ?? topmost(shapes);
}

export type DeckSlide = { id: number; title: string; hidden: boolean };
export type DeckInfo = { slides: DeckSlide[]; font: string | null; color: string | null };

const isWidescreen = ({ cx, cy }: { cx: number; cy: number }) => Math.abs(cx / cy - 16 / 9) < 0.02;

/** The font used most on the slides, theme placeholders aside. */
function mainFont(slides: string[]) {
  const counts = new Map<string, number>();
  for (const xml of slides)
    for (const [, face] of xml.matchAll(/<a:latin\b[^>]*\btypeface="([^"]+)"/g)) if (!face.startsWith("+")) counts.set(face, (counts.get(face) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The colour used most on the slides that is a colour: not white, black or a grey. */
function mainColor(slides: string[]) {
  const counts = new Map<string, number>();
  for (const xml of slides)
    for (const [, hex] of xml.matchAll(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/g)) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Saturated, and dark enough for white text to read on it.
      if (max - min < 0.25 || 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5) continue;
      counts.set(hex.toUpperCase(), (counts.get(hex.toUpperCase()) ?? 0) + 1);
    }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * What the library needs to know about an uploaded deck: its slides with their titles, its font
 * and its main colour. Throws `notPowerPoint`, `notWidescreen` or `noSlides`.
 */
export function readDeck(bytes: Uint8Array): DeckInfo {
  const pkg = Package.open(bytes);
  const size = slideSize(pkg);
  if (!isWidescreen(size)) throw new Error("notWidescreen");
  const refs = slideRefs(pkg);
  if (refs.length === 0) throw new Error("noSlides");
  const xmls = refs.map((r) => pkg.text(r.part));
  return {
    slides: refs.map((r, i) => ({
      id: r.id,
      title: (titleShape(xmls[i], size.cy)?.text ?? "").slice(0, 160),
      hidden: /<p:sld\b[^>]*\bshow="0"/.test(xmls[i].slice(0, 2000)),
    })),
    font: mainFont(xmls),
    color: mainColor(xmls),
  };
}

/** Whether the deck's slide layouts include a blank one, for slides the app makes. */
export const isBlankLayout = (pkg: Package, part: string) => /<p:sldLayout\b[^>]*\btype="blank"/.test(pkg.text(part));

export const layoutOf = (pkg: Package, slidePart: string) => {
  const rel = pkg.rels(slidePart).find((r) => relKind(r.type) === "slideLayout");
  return rel ? resolveTarget(slidePart, rel.target) : null;
};
