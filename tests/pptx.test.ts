import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPresentation, type Item } from "@/server/pptx/build";
import { paragraphs, readDeck, slideRefs } from "@/server/pptx/deck";
import { fillIn } from "@/server/pptx/fill";
import { Package, relKind, resolveTarget } from "@/server/pptx/package";
import { contentsEntries } from "@/lib/presentations";
import { officePath, toPdf } from "@/server/office";

// The decks in tests/fixtures/decks are invented, made with pptxgenjs: "generic" (white, three
// slides, the first with fill-ins split across runs, the second with notes and a picture),
// "engineering" (dark blue, two slides with notes) and "square" (4:3).
const deck = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/decks/${name}.pptx`));
const logos = { white: new Uint8Array(readFileSync("src/server/pptx/assets/applus-white.png")), color: new Uint8Array(readFileSync("src/server/pptx/assets/applus-logo.png")) };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

/** Every relationship leads to a part that is there, and every part has a content type. */
function assertWhole(pkg: Package) {
  for (const part of pkg.parts()) {
    if (part.endsWith(".rels") || part === "[Content_Types].xml") continue;
    expect(pkg.contentType(part), part).toBeTruthy();
    for (const rel of pkg.rels(part)) if (!rel.external) expect(pkg.has(resolveTarget(part, rel.target)), `${part} → ${rel.target}`).toBe(true);
  }
  for (const rel of pkg.rels("")) expect(pkg.has(resolveTarget("", rel.target))).toBe(true);
}

const textOf = (pkg: Package, part: string) => paragraphs(pkg.text(part)).join(" ");

describe("reading a deck", () => {
  it("lists the slides by id with their titles, and the deck's font", () => {
    const info = readDeck(deck("generic"));
    expect(info.slides.map((s) => s.title)).toEqual(["Welcome {client}", "Our services", "Extra slide"]);
    expect(new Set(info.slides.map((s) => s.id)).size).toBe(3);
    expect(info.font).toBe("Arial");
  });

  it("refuses a 4:3 deck and a file that is not PowerPoint", () => {
    expect(() => readDeck(deck("square"))).toThrow("notWidescreen");
    expect(() => readDeck(new Uint8Array([1, 2, 3]))).toThrow("notPowerPoint");
  });
});

describe("fill-ins", () => {
  it("replaces a fill-in split across runs, keeping the first run's look", () => {
    const xml = `<a:p><a:r><a:rPr b="1"/><a:t>For {cli</a:t></a:r><a:r><a:rPr/><a:t>ent} on { Date }</a:t></a:r></a:p>`;
    expect(fillIn(xml, { client: "Acme & Sons", date: "1 May" })).toBe(`<a:p><a:r><a:rPr b="1"/><a:t>For Acme &amp; Sons</a:t></a:r><a:r><a:rPr/><a:t> on 1 May</a:t></a:r></a:p>`);
  });

  it("leaves unknown fill-ins, and ones with no value, as typed", () => {
    const xml = `<a:p><a:r><a:t>{price} for {client}</a:t></a:r></a:p>`;
    expect(fillIn(xml, {})).toBe(xml);
  });
});

describe("building a presentation", () => {
  const sources = new Map([
    ["generic", deck("generic")],
    ["engineering", deck("engineering")],
  ]);
  const g = readDeck(deck("generic")).slides;
  const e = readDeck(deck("engineering")).slides;
  const style = { color: "1D4ED8", font: "Arial" };
  const items: Item[] = [
    { kind: "cover", deck: "generic", cover: { ...style, title: "Proposal", client: "Example Co.", contact: "Attn: Ops", date: "1 May 2026", presenter: "Sales", background: { bytes: PNG, type: "image/png" } } },
    { kind: "slide", deck: "generic", slideId: g[0].id, title: g[0].title },
    { kind: "slide", deck: "engineering", slideId: e[0].id, title: e[0].title },
    { kind: "slide", deck: "generic", slideId: g[1].id, title: g[1].title },
    { kind: "slide", deck: "engineering", slideId: e[1].id, title: e[1].title },
    { kind: "text", deck: "generic", text: { ...style, title: "Why {client}", body: "One\nTwo", image: { bytes: PNG, type: "image/png" }, baseSlideId: g[2].id } },
    { kind: "text", deck: "engineering", text: { ...style, title: "Next steps", body: "Call us", image: null, baseSlideId: null } },
  ];
  const numbers = { ...style, on: true, position: "bottom-left" as const };
  const bytes = buildPresentation(sources, items, { values: { client: "Example Co.", date: "1 May 2026" }, title: "Proposal", logos, numbers });
  const out = Package.open(bytes);
  const slides = slideRefs(out);

  it("has the slides in order, and is a whole, widescreen file", () => {
    expect(slides).toHaveLength(7);
    assertWhole(out);
    expect(readDeck(bytes).slides).toHaveLength(7);
    expect(new Set(slides.map((s) => s.id)).size).toBe(7);
  });

  it("fills in the fill-ins, even split across runs", () => {
    expect(textOf(out, slides[1].part)).toContain("Welcome Example Co.");
    expect(textOf(out, slides[1].part)).toContain("Prepared for Example Co. on 1 May 2026");
    expect(textOf(out, slides[5].part)).toContain("Why Example Co.");
  });

  it("brings the other deck's master with fresh ids, and keeps notes from the base deck only", () => {
    const pres = out.text("ppt/presentation.xml");
    expect(pres.match(/<p:sldMasterId\b/g)).toHaveLength(2);
    const ids = [...pres.matchAll(/<p:sldMasterId\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
    for (const part of out.parts().filter((p) => /^ppt\/slideMasters\/[^/]+\.xml$/.test(p)))
      for (const [, id] of out.text(part).matchAll(/<p:sldLayoutId\b[^>]*\bid="(\d+)"/g)) ids.push(Number(id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id >= 2147483648)).toBe(true);

    const notes = (i: number) => out.rels(slides[i].part).some((r) => relKind(r.type) === "notesSlide");
    expect(notes(3)).toBe(true); // generic, the base deck
    expect(notes(2)).toBe(false); // engineering
    // Each slide uses its own deck's layouts.
    const master = (i: number) => {
      const layout = resolveTarget(slides[i].part, out.rels(slides[i].part).find((r) => relKind(r.type) === "slideLayout")!.target);
      return resolveTarget(layout, out.rels(layout).find((r) => relKind(r.type) === "slideMaster")!.target);
    };
    expect(master(1)).not.toBe(master(2));
    expect(master(1)).toBe(master(3));
  });

  it("makes the cover and the text slides", () => {
    expect(textOf(out, slides[0].part)).toContain("Proposal");
    expect(textOf(out, slides[0].part)).toContain("Example Co.");
    expect(textOf(out, slides[0].part)).toContain("1 May 2026   ·   Sales");
    expect(out.rels(slides[0].part).filter((r) => relKind(r.type) === "image")).toHaveLength(2);
    // Written on the deck's own "Extra slide": its title replaced.
    expect(textOf(out, slides[5].part)).not.toContain("Extra slide");
    expect(textOf(out, slides[5].part)).toContain("One");
    expect(textOf(out, slides[6].part)).toContain("Next steps");
  });

  it("leaves out what nothing uses, and the old preview picture", () => {
    expect(out.has("docProps/thumbnail.jpeg")).toBe(false);
    expect(out.parts().filter((p) => /^ppt\/slides\/[^/]+\.xml$/.test(p))).toHaveLength(7);
  });

  it("keeps each slide's own pictures, whatever the app added before them", () => {
    // PowerPoint names pictures image1.png, image2.png…, as the app names the cover's logo: a
    // slide's picture must stay its own even when the cover, added first, took the same name.
    const pictureOf = (pkg: Package, part: string) => {
      const rel = pkg.rels(part).find((r) => relKind(r.type) === "image")!;
      return pkg.bytes(resolveTarget(part, rel.target));
    };
    const source = Package.open(deck("generic"));
    const services = slideRefs(source)[1];
    const rels = source.rels(services.part);
    const picture = rels.find((r) => relKind(r.type) === "image")!;
    // A picture unlike the cover's, so a mix-up shows.
    const bytes = logos.color;
    source.set("ppt/media/image1.png", bytes);
    source.setContentType("ppt/media/image1.png", "image/png");
    source.setRels(services.part, rels.map((r) => (r === picture ? { ...r, target: "../media/image1.png" } : r)));
    source.removeUnreachable();

    const built = Package.open(
      buildPresentation(new Map([["generic", source.toBytes()]]), [items[0], { kind: "slide", deck: "generic", slideId: services.id, title: "" }], { values: {}, title: "x", logos, numbers }),
    );
    expect(pictureOf(built, slideRefs(built)[1].part)).toEqual(bytes);
  });

  it("refuses a slide that is not in its deck", () => {
    expect(() => buildPresentation(sources, [{ kind: "slide", deck: "generic", slideId: 9999, title: "" }], { values: {}, title: "x", logos, numbers })).toThrow("missingSlide");
  });

  it("opens in LibreOffice, a page a slide", { timeout: 120_000 }, async () => {
    if (!officePath()) {
      await expect(toPdf(bytes)).rejects.toThrow("officeMissing");
      return;
    }
    const pdf = new TextDecoder("latin1").decode(await toPdf(bytes));
    expect(pdf.match(/\/Type\s*\/Page\b/g)).toHaveLength(7);
  });
});

describe("the contents and slide numbers", () => {
  const sources = new Map([
    ["generic", deck("generic")],
    ["engineering", deck("engineering")],
  ]);
  const [g1, g2] = readDeck(deck("generic")).slides;
  const [e1, e2] = readDeck(deck("engineering")).slides;
  const style = { color: "1D4ED8", font: "Arial" };
  const cover = { ...style, title: "Proposal", client: "Example Co.", contact: null, date: null, presenter: null, background: null };
  const items = (heading: string): Item[] => [
    { kind: "cover", deck: "generic", cover },
    { kind: "contents", deck: "generic", contents: { ...style, heading } },
    { kind: "slide", deck: "generic", slideId: g1.id, title: "Welcome" },
    { kind: "slide", deck: "engineering", slideId: e1.id, title: "Construction cover" },
    // The same title again, straight after: listed once. An untitled slide is left out.
    { kind: "slide", deck: "engineering", slideId: e2.id, title: "Construction cover" },
    { kind: "slide", deck: "generic", slideId: g2.id, title: "" },
    { kind: "text", deck: "generic", text: { ...style, title: "Next steps", body: "Call us", image: null, baseSlideId: null } },
  ];
  const build = (on: boolean) =>
    Package.open(buildPresentation(sources, items("Agenda"), { values: {}, title: "x", logos, numbers: { ...style, on, position: "bottom-right" } }));
  const out = build(true);
  const slides = slideRefs(out);
  const xml = (i: number) => out.text(slides[i].part);

  it("lists the slides after it with their numbers, each going to its slide", () => {
    const text = textOf(out, slides[1].part);
    expect(text).toContain("Agenda");
    expect(text).toContain("03 Welcome 04 Construction cover 07 Next steps");
    expect(text).not.toContain("05");
    expect(text).not.toContain("06");
    const links = out.rels(slides[1].part).filter((r) => relKind(r.type) === "slide");
    expect(links.map((r) => resolveTarget(slides[1].part, r.target))).toEqual([slides[2].part, slides[3].part, slides[6].part]);
    // The number and the title of each line go there.
    expect(xml(1).match(/ppaction:\/\/hlinksldjump/g)).toHaveLength(6);
    assertWhole(out);
  });

  it("numbers every slide but the cover, turning a number typed on a library slide into a field", () => {
    expect(xml(0)).not.toContain('type="slidenum"');
    for (let i = 1; i < slides.length; i++) expect(xml(i), `slide ${i + 1}`).toContain('type="slidenum"');
    // The generic deck's second slide had "2" typed at its foot: it is now this slide's number.
    expect(xml(5)).not.toContain('name="Slide number"');
    expect(xml(5)).toMatch(/type="slidenum">[\s\S]*?<a:t>6<\/a:t>/);
    expect(textOf(out, slides[5].part)).not.toMatch(/\b2\b/);
    // Others get a numbered tag.
    expect(xml(2)).toContain('name="Slide number"');
  });

  it("with numbers off adds no tags, but still corrects numbers typed on library slides", () => {
    const plain = build(false);
    const [, , welcome, , , services] = slideRefs(plain);
    expect(plain.text(welcome.part)).not.toContain('type="slidenum"');
    expect(plain.text(services.part)).toMatch(/type="slidenum">[\s\S]*?<a:t>6<\/a:t>/);
  });

  it("works out the contents the same way for the page and the file", () => {
    const outline = [
      { kind: "cover" as const, title: "" },
      { kind: "contents" as const, title: "Contents" },
      { kind: "slide" as const, title: "Impact" },
      { kind: "slide" as const, title: " impact " },
      { kind: "text" as const, title: "" },
      { kind: "slide" as const, title: "Costs" },
    ];
    expect(contentsEntries(outline, 1)).toEqual([
      { title: "Impact", page: 3 },
      { title: "Costs", page: 6 },
    ]);
  });
});
