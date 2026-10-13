import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PresentationItem } from "@/lib/presentations";
import { deckUpdate } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ap-it-uploads-"));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const settings = await import("@/server/settings");
const service = await import("@/server/services/presentations");
const { Package } = await import("@/server/pptx/package");
const { officePath } = await import("@/server/office");
const { paragraphs, readDeck, slideRefs } = await import("@/server/pptx/deck");

// Invented decks: see tests/pptx.test.ts.
const deck = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/decks/${name}.pptx`));
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64"));

/** A PDF of `pages` blank pages, standing in for one saved from PowerPoint. */
async function pdfOf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([960, 540]);
  return doc.save();
}

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let employee: User;
let it_: User;
let generic: Awaited<ReturnType<typeof service.addDeck>>;
let engineering: Awaited<ReturnType<typeof service.addDeck>>;
beforeAll(async () => {
  await seedDemo(NOW);
  [admin, employee, it_] = await Promise.all(["admin@applus.test", "employee@applus.test", "it@applus.test"].map(asUser));
  generic = await service.addDeck({ name: "Generic", category: "generic", file: { name: "Generic.pptx", bytes: deck("generic") }, preview: await pdfOf(3) }, admin);
  engineering = await service.addDeck({ name: "Engineering", category: "engineering", file: { name: "Engineering.pptx", bytes: deck("engineering") }, preview: await pdfOf(2) }, admin);
}, 120_000);

describe("the library", () => {
  it("lists a deck's slides by id, chosen to start with but for the one to write on, with its font and colour", () => {
    expect(generic.slides.map((x) => [x.title, x.default])).toEqual([
      ["Welcome {client}", true],
      ["Our services", true],
      ["Extra slide", false],
    ]);
    expect(generic.font).toBe("Arial");
    expect(generic.color).toMatch(/^[0-9A-F]{6}$/);
    // A slide titled as an extra slide is the one salespeople write on.
    expect(generic.textSlideId).toBe(generic.slides[2].id);
  });

  it("refuses a 4:3 deck, a file that is not PowerPoint, and a PDF that does not match", async () => {
    const add = (bytes: Uint8Array, preview: Uint8Array | null) => service.addDeck({ name: "x", category: "generic", file: { name: "x.pptx", bytes }, preview }, admin);
    await expect(add(deck("square"), null)).rejects.toMatchObject({ status: 400, message: "notWidescreen" });
    await expect(add(PNG, null)).rejects.toMatchObject({ status: 400, message: "notPowerPoint" });
    await expect(add(deck("generic"), await pdfOf(2))).rejects.toMatchObject({ status: 400, message: "previewPages" });
    await expect(add(deck("generic"), PNG)).rejects.toMatchObject({ status: 400, message: "previewType" });
  });

  it("has LibreOffice make the slide pictures when no PDF comes with the deck", { timeout: 120_000 }, async () => {
    const add = () => service.addDeck({ name: "Made here", category: "generic", file: { name: "x.pptx", bytes: deck("engineering") }, preview: null }, admin);
    if (!officePath()) {
      await expect(add()).rejects.toMatchObject({ status: 400, message: "previewNeeded" });
      return;
    }
    const made = await add();
    const pdf = await PDFDocument.load((await service.deckFile(admin, made.id, "preview")).bytes);
    expect(pdf.getPageCount()).toBe(2);
    await service.deleteDeck(made.id, admin);
  });

  it("is for admins and for people the Presentations tool is open to, which starts after approval", async () => {
    await expect(service.listDecks(employee)).rejects.toMatchObject({ status: 403 });
    expect(await service.listDecks(admin)).toHaveLength(2);
    await settings.putSetting("tools", { presentations: { mode: "on", blockedDepartments: [] } }, admin);
    expect((await service.listDecks(employee)).map((d) => d.name)).toEqual(["Engineering", "Generic"]);
  });

  it("serves the slide pictures to users, and the PowerPoint file to admins only", async () => {
    const preview = await service.deckFile(employee, generic.id, "preview");
    expect(preview.type).toBe("application/pdf");
    await expect(service.deckFile(employee, generic.id, "pptx")).rejects.toMatchObject({ status: 404 });
    expect((await service.deckFile(admin, generic.id, "pptx")).bytes.length).toBe(deck("generic").length);
  });
});

describe("a presentation", () => {
  let id: number;
  let items: PresentationItem[];

  it("starts from a deck: its cover, then the slides chosen to start with", async () => {
    const p = await service.createPresentation(employee, { deckId: generic.id, title: "Proposal", client: "Example Co.", contact: null, date: "2026-10-01", presenter: "Sales" });
    id = p.id;
    items = p.items;
    expect(p.items.map((i) => i.type)).toEqual(["cover", "slide", "slide"]);
    expect(await service.listPresentations(employee)).toEqual([expect.objectContaining({ id, slides: 3, client: "Example Co." })]);
  });

  it("is its owner's alone", async () => {
    await expect(service.getPresentation(it_, id)).rejects.toMatchObject({ status: 404 });
    expect(await service.listPresentations(it_)).toEqual([]);
  });

  it("takes slides from other decks and slides of its own, with pictures uploaded for it", async () => {
    const { key } = await service.addPresentationImage(employee, id, PNG);
    await expect(service.addPresentationImage(employee, id, new TextEncoder().encode("<svg/>"))).rejects.toMatchObject({ status: 400, message: "imageType" });
    items = [
      items[0],
      { key: "e1", type: "slide", deckId: engineering.id, slideId: engineering.slides[1].id },
      items[2],
      { key: "t1", type: "text", title: "Why {client}", body: "One\nTwo", imageKey: key },
    ];
    const saved = await service.updatePresentation(employee, id, { items });
    expect(saved.items).toEqual(items);
    await expect(service.updatePresentation(employee, id, { items: [{ key: "x", type: "slide", deckId: generic.id, slideId: 9999 }] })).rejects.toMatchObject({ message: "unknownSlide" });
    await expect(service.updatePresentation(employee, id, { items: [{ key: "x", type: "text", title: "", body: "", imageKey: "2026-01/00000000-0000-0000-0000-000000000000" }] })).rejects.toMatchObject({ message: "unknownImage" });
  });

  it("downloads as PowerPoint with the fill-ins filled in, and counts the use", async () => {
    const file = await service.presentationFile(employee, id, "pptx");
    expect(file.name).toBe("Proposal - Example Co.pptx");
    expect(readDeck(file.bytes).slides).toHaveLength(4);
    const pkg = Package.open(file.bytes);
    const text = slideRefs(pkg).map((r) => paragraphs(pkg.text(r.part)).join(" "));
    expect(text[0]).toContain("Example Co.");
    expect(text[0]).toContain("1 October 2026");
    expect(text[3]).toContain("Why Example Co.");
    const uses = await db.select().from(s.toolUses).where(eq(s.toolUses.tool, "presentations"));
    expect(uses).toHaveLength(1);
  });

  it("keeps a slide taken out of the library until it is removed, but leaves it out of the file", async () => {
    // A new version of the generic deck without its last slide.
    const pkg = Package.open(deck("generic"));
    const last = slideRefs(pkg).at(-1)!;
    pkg.set("ppt/presentation.xml", pkg.text("ppt/presentation.xml").replace(new RegExp(`<p:sldId id="${last.id}"[^>]*/>`), ""));
    pkg.removeUnreachable();
    const updated = await service.replaceDeckFile(generic.id, { file: { name: "Generic v2.pptx", bytes: pkg.toBytes() }, preview: await pdfOf(2) }, admin);
    expect(updated.slides).toHaveLength(2);
    expect(updated.textSlideId).toBeNull();

    const withGone = [...items, { key: "g3", type: "slide" as const, deckId: generic.id, slideId: last.id }];
    await expect(service.updatePresentation(employee, id, { items: withGone })).rejects.toMatchObject({ message: "unknownSlide" });
    // The cover, the engineering slide, the generic slide still there, and the text slide.
    expect(readDeck((await service.presentationFile(employee, id, "pptx")).bytes).slides).toHaveLength(4);
  });

  it("copies for another client, pictures and all, and is removed with its pictures", async () => {
    const copy = await service.duplicatePresentation(employee, id, "(copy)");
    expect(copy.title).toBe("Proposal (copy)");
    expect(copy.images).toHaveLength(1);
    const original = await service.getPresentation(employee, id);
    expect(copy.images[0]).not.toBe(original.images[0]);
    const copyImage = (copy.items.find((i) => i.type === "text") as { imageKey: string }).imageKey;
    expect(copyImage).toBe(copy.images[0]);

    await service.deletePresentation(employee, copy.id);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, copy.images[0]))).toBe(false);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, original.images[0]))).toBe(true);
  });

  it("still builds when its deck is hidden, and from its other slides when its deck is removed", async () => {
    await service.updateDeck(generic.id, { active: false }, admin);
    expect((await service.listDecks(employee)).map((d) => [d.name, d.active])).toEqual([
      ["Engineering", true],
      ["Generic", false],
    ]);
    await expect(service.createPresentation(employee, { deckId: generic.id, title: "x", client: "y", contact: null, date: null, presenter: null })).rejects.toMatchObject({ message: "deckMissing" });
    expect(readDeck((await service.presentationFile(employee, id, "pptx")).bytes).slides).toHaveLength(4);
    await service.deleteDeck(generic.id, admin);
    // The engineering slide becomes the base; the cover and text slide take its look.
    expect(readDeck((await service.presentationFile(employee, id, "pptx")).bytes).slides).toHaveLength(3);
  });
});

describe("deck settings", () => {
  it("renames slides and sets which start chosen; the writing slide must be one of the deck's", async () => {
    const [first, second] = engineering.slides;
    const input = deckUpdate.parse({ slides: [{ id: first.id, title: "Cover photo", default: false }], color: "#112233" });
    const updated = await service.updateDeck(engineering.id, input, admin);
    expect(updated.slides.map((x) => [x.title, x.default])).toEqual([
      ["Cover photo", false],
      [second.title, true],
    ]);
    expect(updated.color).toBe("112233");
    await expect(service.updateDeck(engineering.id, { textSlideId: 9999 }, admin)).rejects.toMatchObject({ message: "unknownSlide" });
  });
});
