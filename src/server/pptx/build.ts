import { imageSize } from "@/lib/files";
import { EMU_PER_INCH, isBlankLayout, layoutOf, slideRefs, slideSize, titleShape } from "./deck";
import { type FillIn, fillIn } from "./fill";
import { escapeXml, Package, REL, type Relationship, relKind, relativeTarget, resolveTarget } from "./package";
import { type Box, coverCrop, fitInside, isDark, picture, shape, slideXml, solidFill, textBox } from "./shapes";

// Builds a presentation from slides of the library's decks, plus a cover and text slides the app
// makes. The first item's deck is the base: the new file starts as that deck emptied of slides,
// so it keeps that deck's masters, theme and settings. Slides from other decks bring their own
// layouts, masters and themes with them, so each looks exactly as it does in its own deck.

export type Image = { bytes: Uint8Array; type: "image/png" | "image/jpeg" };

export type Style = { color: string; font: string | null };

export type Cover = Style & {
  title: string;
  client: string;
  contact: string | null;
  /** The date and the presenter, as they should read. */
  date: string | null;
  presenter: string | null;
  background: Image | null;
};

export type TextSlide = Style & {
  title: string;
  body: string;
  image: Image | null;
  /** A slide of the deck to write on (its look, with a new title); else a plain slide is drawn. */
  baseSlideId: number | null;
};

export type Item =
  | { kind: "slide"; deck: string; slideId: number }
  | { kind: "cover"; deck: string; cover: Cover }
  | { kind: "text"; deck: string; text: TextSlide };

export type Logos = { white: Uint8Array; color: Uint8Array };

const SLIDE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const LOGO_RATIO = 1200 / 372; // the logo images' width to height

/** Parts a slide shares with others; everything else a slide uses is copied for it alone. */
const SHARED = /^ppt\/(media|slideLayouts|slideMasters|theme|notesMasters|fonts)\//;

/** Relationships a slide drops when it moves: speaker notes (from other decks) and comments. */
const dropped = (kind: string, foreign: boolean) => kind === "comments" || kind === "commentAuthors" || (foreign && kind === "notesSlide");

const inch = (n: number) => n * EMU_PER_INCH;
const extension = (type: Image["type"]) => (type === "image/png" ? "png" : "jpeg");

class Builder {
  readonly out: Package;
  private shared = new Map<string, Map<string, string>>();
  /** The base deck's own parts still in the file once its slides are gone: its masters, layouts, theme and their pictures. */
  private kept = new Set<string>();
  private sizes: { cx: number; cy: number };
  private nextShape = 2;

  constructor(
    private sources: Map<string, Package>,
    private base: string,
    private logos: Logos,
  ) {
    const basePkg = sources.get(base)!;
    this.out = basePkg.clone();
    this.sizes = slideSize(basePkg);
    this.emptySlides();
    this.kept = new Set(this.out.parts());
  }

  /** The base deck without its slides, and without what refers to them. */
  private emptySlides() {
    const pres = "ppt/presentation.xml";
    const slideRels = new Set(slideRefs(this.out).map((r) => r.relId));
    this.out.setRels(
      pres,
      this.out.rels(pres).filter((r) => !slideRels.has(r.id)),
    );
    this.out.set(
      pres,
      this.out
        .text(pres)
        .replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, "<p:sldIdLst></p:sldIdLst>")
        // Sections and custom shows list slides that are gone.
        .replace(/<p:custShowLst>[\s\S]*?<\/p:custShowLst>/, "")
        .replace(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">[\s\S]*?<\/p:ext>/, ""),
    );
    // The file's preview picture would show the old first slide.
    this.out.setRels(
      "",
      this.out.rels("").filter((r) => relKind(r.type) !== "thumbnail"),
    );
    this.out.removeUnreachable();
  }

  // ------------------------------------------------------------ copying parts

  private sharedMap(deck: string) {
    let map = this.shared.get(deck);
    if (!map) this.shared.set(deck, (map = new Map()));
    return map;
  }

  /**
   * Copies a part of a deck into the new file, with what it refers to, and returns its new name.
   * Shared parts are copied once per deck; a slide's own parts once per use of the slide. Parts
   * of the base deck still in the file (its masters, layouts, theme) are used where they are.
   */
  private importPart(deck: string, src: Package, part: string, local: Map<string, string>, slide: string | null): string {
    const isShared = SHARED.test(part);
    const map = isShared ? this.sharedMap(deck) : local;
    const known = map.get(part);
    if (known) return known;
    // Only the base deck's own parts are used where they are: a part the app added since may
    // have taken a name the deck also uses (a cover's logo as image1.png, say).
    if (isShared && deck === this.base && this.kept.has(part)) {
      map.set(part, part);
      return part;
    }

    const name = deck === this.base && !this.out.has(part) ? part : this.out.freeName(part);
    map.set(part, name);
    this.out.set(name, src.bytes(part));
    const type = src.contentType(part);
    if (type) this.out.setContentType(name, type);

    const foreign = deck !== this.base;
    // The slide this part belongs to, for links that point back at it.
    const owner = slide ?? (/^ppt\/slides\/[^/]+\.xml$/.test(name) ? name : null);
    const rels: Relationship[] = [];
    for (const rel of src.rels(part)) {
      if (rel.external) {
        rels.push(rel);
        continue;
      }
      const kind = relKind(rel.type);
      if (dropped(kind, foreign)) continue;
      const target = resolveTarget(part, rel.target);
      if (!src.has(target)) continue;
      // A link to another slide of the deck cannot follow it there; it stays on this slide.
      const copied = kind === "slide" && !local.has(target) && owner ? owner : this.importPart(deck, src, target, local, owner);
      rels.push({ ...rel, target: relativeTarget(name, copied) });
    }
    if (rels.length || src.rels(part).length) this.out.setRels(name, rels);
    if (foreign && /^ppt\/slideMasters\/[^/]+\.xml$/.test(name)) this.addMaster(name);
    return name;
  }

  /** Lists a master copied from another deck, with fresh ids for it and its layouts. */
  private addMaster(master: string) {
    const pres = "ppt/presentation.xml";
    const ids: number[] = [];
    const presXml = this.out.text(pres);
    for (const [, id] of presXml.matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)) ids.push(Number(id));
    for (const part of this.out.parts().filter((p) => /^ppt\/slideMasters\/[^/]+\.xml$/.test(p)))
      for (const [, id] of this.out.text(part).matchAll(/<p:sldLayoutId\b[^>]*\bid="(\d+)"/g)) ids.push(Number(id));
    let next = Math.max(2147483647, ...ids) + 1;

    const masterId = next++;
    this.out.set(
      master,
      this.out.text(master).replace(/(<p:sldLayoutId\b[^>]*\bid=")(\d+)"/g, (_, open: string) => `${open}${next++}"`),
    );
    const relId = this.out.freeRelId(pres);
    this.out.setRels(pres, [...this.out.rels(pres), { id: relId, type: `${REL}/slideMaster`, target: relativeTarget(pres, master), external: false }]);
    this.out.set(pres, presXml.replace("</p:sldMasterIdLst>", `<p:sldMasterId id="${masterId}" r:id="${relId}"/></p:sldMasterIdLst>`));
  }

  /** Puts a slide at the end of the show. */
  private appendSlide(part: string) {
    const pres = "ppt/presentation.xml";
    const relId = this.out.freeRelId(pres);
    this.out.setRels(pres, [...this.out.rels(pres), { id: relId, type: `${REL}/slide`, target: relativeTarget(pres, part), external: false }]);
    const xml = this.out.text(pres);
    const used = [...(xml.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] ?? "").matchAll(/\bid="(\d+)"/g)].map((m) => Number(m[1]));
    const id = Math.max(255, ...used) + 1;
    this.out.set(pres, xml.replace("</p:sldIdLst>", `<p:sldId id="${id}" r:id="${relId}"/></p:sldIdLst>`));
  }

  /** Copies one of a deck's slides in, and returns its new part. */
  private copySlide(deck: string, slideId: number) {
    const src = this.sources.get(deck);
    const ref = src && slideRefs(src).find((r) => r.id === slideId);
    if (!src || !ref) throw new Error("missingSlide");
    const part = this.importPart(deck, src, ref.part, new Map(), null);
    // A slide hidden in its deck was chosen, so it is shown.
    this.out.set(part, this.out.text(part).replace(/(<p:sld\b[^>]*?)\sshow="0"/, "$1"));
    return part;
  }

  /** The deck's blank layout (or the layout of its first slide), in the new file. */
  private blankLayout(deck: string) {
    const src = this.sources.get(deck)!;
    const layouts = src.parts().filter((p) => /^ppt\/slideLayouts\/[^/]+\.xml$/.test(p));
    const blank = layouts.find((p) => isBlankLayout(src, p)) ?? layoutOf(src, slideRefs(src)[0].part) ?? layouts[0];
    return this.importPart(deck, src, blank, new Map(), null);
  }

  /** Adds an image to the file for a slide; returns its relationship. */
  private addImage(bytes: Uint8Array, type: Image["type"], slide: string, rels: Relationship[]) {
    const media = this.out.freeName(`ppt/media/image1.${extension(type)}`);
    this.out.set(media, bytes);
    this.out.setContentType(media, type);
    const used = new Set([...this.out.rels(slide), ...rels].map((r) => r.id));
    let n = 1;
    while (used.has(`rId${n}`)) n++;
    const rel = { id: `rId${n}`, type: `${REL}/image`, target: relativeTarget(slide, media), external: false };
    rels.push(rel);
    return rel.id;
  }

  private newSlide(deck: string, build: (slide: string, rels: Relationship[]) => string) {
    const slide = this.out.freeName("ppt/slides/slide1.xml");
    const layout = this.blankLayout(deck);
    const rels: Relationship[] = [{ id: "rId1", type: `${REL}/slideLayout`, target: relativeTarget(slide, layout), external: false }];
    this.nextShape = 2;
    this.out.set(slide, "");
    const xml = build(slide, rels);
    this.out.set(slide, xml);
    this.out.setRels(slide, rels);
    this.out.setContentType(slide, SLIDE_TYPE);
    return slide;
  }

  private id() {
    return this.nextShape++;
  }

  // ------------------------------------------------------------ slides the app makes

  /** Scales a design made for a 13.33 by 7.5 inch slide to this file's slides. */
  private box(x: number, y: number, w: number, h: number): Box {
    const k = this.sizes.cx / 12192000;
    return { x: inch(x) * k, y: inch(y) * k, w: inch(w) * k, h: inch(h) * k };
  }

  /**
   * The cover: the deck's colour (over its picture, if it has one), the company logo, the
   * presentation's title, who it is for, and when and by whom it is given.
   */
  addCover(deck: string, c: Cover) {
    const { cx, cy } = this.sizes;
    const dark = isDark(c.color);
    const ink = dark ? "FFFFFF" : "1F2937";
    const slide = this.newSlide(deck, (slide, rels) => {
      const shapes: string[] = [];
      const background = solidFill(c.color);
      let textWidth = 8.2;
      const size = c.background && imageSize(c.background.bytes);
      if (c.background && size) {
        const relId = this.addImage(c.background.bytes, c.background.type, slide, rels);
        shapes.push(picture(this.id(), "Cover picture", relId, { x: 0, y: 0, w: cx, h: cy }, coverCrop(size, { w: cx, h: cy })));
        shapes.push(shape(this.id(), "Cover panel", { x: 0, y: 0, w: cx * 0.6, h: cy }, "rect", solidFill(c.color, 90)));
        textWidth = 6.6;
      } else {
        // Two soft rings at the right, in the cover's own colour, so a plain cover is not flat.
        const ring = solidFill(dark ? "FFFFFF" : "000000", 7);
        shapes.push(shape(this.id(), "Ring", this.box(8.4, -1.6, 7.2, 7.2), "ellipse", ring));
        shapes.push(shape(this.id(), "Ring", this.box(10.2, 3.9, 4.6, 4.6), "ellipse", ring));
      }
      const logo = this.addImage(dark ? this.logos.white : this.logos.color, "image/png", slide, rels);
      shapes.push(picture(this.id(), "Logo", logo, this.box(0.75, 0.6, 0.95 * LOGO_RATIO, 0.95)));

      const text = (t: string, size: number, bold = false, alpha = 100) => ({ text: t, size, bold, fill: solidFill(ink, alpha), font: c.font });
      shapes.push(textBox(this.id(), "Title", this.box(0.75, 2.1, textWidth, 1.7), [text(c.title, 36, true)], "b"));
      shapes.push(textBox(this.id(), "Prepared for", this.box(0.75, 4.05, textWidth, 0.4), [text("Prepared for", 14, false, 80)]));
      shapes.push(textBox(this.id(), "Client", this.box(0.75, 4.45, textWidth, 0.75), [text(c.client, 28, true)]));
      if (c.contact) shapes.push(textBox(this.id(), "Contact", this.box(0.75, 5.2, textWidth, 0.45), [text(c.contact, 16, false, 90)]));
      const footer = [c.date, c.presenter].filter(Boolean).join("   ·   ");
      if (footer) shapes.push(textBox(this.id(), "Date and presenter", this.box(0.75, 6.45, textWidth, 0.4), [text(footer, 13, false, 85)]));
      return slideXml(background, shapes);
    });
    this.appendSlide(slide);
  }

  /** The body text as paragraphs: a line each, as bullets when there are several. */
  private bodyParagraphs(body: string, size: number, fill: string, font: string | null) {
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);
    return lines.map((line) => ({ text: line, size, fill, font, bullet: lines.length > 1, after: 8 }));
  }

  /**
   * A slide of the salesperson's own: a title, text, and a picture. Written on one of the deck's
   * slides (keeping its look and putting the title in place of its own) or drawn plain.
   */
  addText(deck: string, t: TextSlide) {
    const { cx, cy } = this.sizes;
    if (t.baseSlideId) {
      const slide = this.copySlide(deck, t.baseSlideId);
      let xml = this.out.text(slide);
      const title = titleShape(xml, cy);
      const ids = [...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
      this.nextShape = Math.max(1, ...ids) + 1;

      let top = inch(1.5);
      let left = inch(0.6);
      let fill = solidFill("374151");
      if (title) {
        // The title keeps the look of its first run and paragraph.
        const rPr = title.xml.match(/<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*[^/]>[\s\S]*?<\/a:rPr>/)?.[0] ?? '<a:rPr lang="en-US"/>';
        fill = rPr.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/)?.[0] ?? fill;
        const pPr = title.xml.match(/<a:p>\s*(<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*[^/]>[\s\S]*?<\/a:pPr>)/)?.[1] ?? "";
        const paragraph = `<a:p>${pPr}<a:r>${rPr}<a:t>${escapeXml(t.title)}</a:t></a:r></a:p>`;
        const retitled = title.xml.replace(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, "").replace("</p:txBody>", `${paragraph}</p:txBody>`);
        xml = xml.slice(0, title.start) + retitled + xml.slice(title.start + title.xml.length);
        const off = title.xml.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
        const ext = title.xml.match(/<a:ext\b[^>]*\bcy="(\d+)"/);
        if (off && ext) {
          top = Number(off[2]) + Number(ext[1]) + inch(0.3);
          left = Math.max(inch(0.5), Number(off[1]));
        }
      }
      const rels = this.out.rels(slide);
      const shapes = this.textAndPicture(slide, rels, t, { x: left, y: top, w: cx - left - inch(0.6), h: cy - top - inch(0.6) }, fill);
      xml = xml.replace(/<\/p:spTree>/, `${shapes.join("")}</p:spTree>`);
      this.out.set(slide, xml);
      this.out.setRels(slide, rels);
      this.appendSlide(slide);
      return;
    }

    const slide = this.newSlide(deck, (slide, rels) => {
      const shapes = [
        textBox(this.id(), "Title", this.box(0.6, 0.45, 12.1, 0.9), [{ text: t.title, size: 28, bold: true, fill: solidFill(t.color), font: t.font }], "ctr"),
        ...this.textAndPicture(slide, rels, t, this.box(0.6, 1.6, 12.1, 5.0), solidFill("374151")),
      ];
      const logo = this.addImage(this.logos.color, "image/png", slide, rels);
      shapes.push(picture(this.id(), "Logo", logo, this.box(13.33 - 0.6 - 0.45 * LOGO_RATIO, 6.8, 0.45 * LOGO_RATIO, 0.45)));
      return slideXml(solidFill("FFFFFF"), shapes);
    });
    this.appendSlide(slide);
  }

  /** The text, with the picture beside it when there is one. */
  private textAndPicture(slide: string, rels: Relationship[], t: TextSlide, area: Box, fill: string) {
    const shapes: string[] = [];
    const size = t.image && imageSize(t.image.bytes);
    const gap = inch(0.4);
    const textArea = t.image && size ? { ...area, w: area.w * 0.55 - gap / 2 } : area;
    if (t.body.trim()) shapes.push(textBox(this.id(), "Text", textArea, this.bodyParagraphs(t.body, 18, fill, t.font)));
    if (t.image && size) {
      const relId = this.addImage(t.image.bytes, t.image.type, slide, rels);
      const imageArea = t.body.trim() ? { x: area.x + area.w * 0.55 + gap / 2, y: area.y, w: area.w * 0.45 - gap / 2, h: area.h } : area;
      shapes.push(picture(this.id(), "Picture", relId, fitInside(size, imageArea)));
    }
    return shapes;
  }

  addSlide(deck: string, slideId: number) {
    this.appendSlide(this.copySlide(deck, slideId));
  }

  /** Fills in the slides' fill-ins, tidies away what nothing uses, and writes the file. */
  finish(values: Partial<Record<FillIn, string>>, title: string) {
    for (const { part } of slideRefs(this.out)) this.out.set(part, fillIn(this.out.text(part), values));
    this.out.removeUnreachable();
    const slides = slideRefs(this.out).length;
    if (this.out.has("docProps/app.xml")) {
      this.out.set(
        "docProps/app.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><TotalTime>0</TotalTime><Application>Microsoft Office PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${slides}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><AppVersion>16.0000</AppVersion></Properties>`,
      );
    }
    if (this.out.has("docProps/core.xml")) {
      const core = this.out.text("docProps/core.xml");
      const titled = /<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/.test(core)
        ? core.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/, `<dc:title>${escapeXml(title)}</dc:title>`)
        : core;
      this.out.set("docProps/core.xml", titled);
    }
    return this.out.toBytes();
  }
}

/**
 * A new PowerPoint file of the items in order. `sources` are the decks' files by key; every item
 * names its deck. Throws `missingSlide` when a slide is no longer in its deck.
 */
export function buildPresentation(
  sources: Map<string, Uint8Array>,
  items: Item[],
  options: { values: Partial<Record<FillIn, string>>; title: string; logos: Logos },
) {
  if (items.length === 0) throw new Error("noSlides");
  const packages = new Map([...sources].map(([key, bytes]) => [key, Package.open(bytes)]));
  const builder = new Builder(packages, items[0].deck, options.logos);
  for (const item of items) {
    if (!packages.has(item.deck)) throw new Error("missingSlide");
    if (item.kind === "slide") builder.addSlide(item.deck, item.slideId);
    else if (item.kind === "cover") builder.addCover(item.deck, item.cover);
    else builder.addText(item.deck, item.text);
  }
  return builder.finish(options.values, options.title);
}
