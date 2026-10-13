import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { z } from "zod";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { can } from "@/lib/permissions";
import { type DeckCategory, DEFAULT_DECK_COLOR, type LibrarySlide, MAX_DECK_BYTES, type PresentationItem } from "@/lib/presentations";
import type { deckUpdate, presentationCreate, presentationUpdate } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { decks, presentations, toolUses } from "../db/schema";
import { readStoredFile, removeStoredFile, storeFile } from "../files";
import { badRequest, notFound, one } from "../http";
import { toPdf } from "../office";
import { buildPresentation, type Image, type Item } from "../pptx/build";
import { readDeck, slideRefs } from "../pptx/deck";
import { Package } from "../pptx/package";
import { requireTool } from "./tools";

type ImageType = "image/png" | "image/jpeg";

/** Admins manage the library and may always use it; others need the Presentations tool. */
async function requireAccess(user: SessionUser) {
  if (can(user.role, "settings")) return;
  await requireTool(user, "presentations");
}

const isAdmin = (user: SessionUser) => can(user.role, "settings");

// ---------------------------------------------------------------- the library

type DeckRow = typeof decks.$inferSelect;

/** A deck as pages see it: no storage keys. */
const shown = (d: DeckRow) => ({
  id: d.id,
  name: d.name,
  category: d.category,
  fileName: d.fileName,
  fileSize: d.fileSize,
  /** Changes with the file, so the slide pictures are fetched again only then. */
  version: d.previewKey.slice(-12),
  slides: d.slides,
  font: d.font,
  color: d.color,
  hasCoverImage: d.coverImageKey !== null,
  textSlideId: d.textSlideId,
  active: d.active,
  updatedBy: d.updatedBy,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/**
 * The library's decks. Hidden ones are listed too, so slides already taken from them still show;
 * only decks in use are offered for new slides and presentations.
 */
export async function listDecks(user: SessionUser) {
  await requireAccess(user);
  const rows = await db.select().from(decks).orderBy(decks.category, decks.name);
  return rows.map(shown);
}

async function deckRow(id: number) {
  const [row] = await db.select().from(decks).where(eq(decks.id, id));
  if (!row) throw notFound();
  return row;
}

/** The deck with its hidden slides shown, so the PDF has a page for every slide. */
function allShown(bytes: Uint8Array) {
  const pkg = Package.open(bytes);
  let hidden = false;
  for (const { part } of slideRefs(pkg)) {
    const xml = pkg.text(part);
    const shownXml = xml.replace(/(<p:sld\b[^>]*?)\sshow="0"/, "$1");
    if (shownXml !== xml) {
      hidden = true;
      pkg.set(part, shownXml);
    }
  }
  return hidden ? pkg.toBytes() : bytes;
}

async function pageCount(pdf: Uint8Array) {
  try {
    return (await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return -1;
  }
}

/**
 * The PDF the slide pictures are drawn from: one uploaded with the deck (saved from PowerPoint,
 * hidden slides included), or one LibreOffice makes. Either must have a page for every slide.
 */
async function previewFor(bytes: Uint8Array, slides: number, uploaded: Uint8Array | null) {
  if (uploaded?.length) {
    if (sniffType(uploaded) !== "application/pdf") throw badRequest("previewType");
    if ((await pageCount(uploaded)) !== slides) throw badRequest("previewPages");
    return uploaded;
  }
  let pdf: Uint8Array;
  try {
    pdf = await toPdf(allShown(bytes));
  } catch (error) {
    throw badRequest((error as Error).message === "officeMissing" ? "previewNeeded" : "previewFailed");
  }
  if ((await pageCount(pdf)) !== slides) throw badRequest("previewFailed");
  return pdf;
}

/** Reads an uploaded deck; its problems become messages for the form. */
function readUpload(bytes: Uint8Array) {
  if (bytes.length === 0) throw badRequest("fileEmpty");
  if (bytes.length > MAX_DECK_BYTES) throw badRequest("deckSize");
  try {
    return readDeck(bytes);
  } catch (error) {
    const code = (error as Error).message;
    throw badRequest(["notWidescreen", "noSlides"].includes(code) ? code : "notPowerPoint");
  }
}

const cleanName = (name: string, extension: string) =>
  `${
    (name.split(/[\\/]/).pop() ?? "")
      .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
      .trim()
      .replace(/\.[^.]*$/, "")
      .slice(0, 120) || "presentation"
  }.${extension}`;

/** Whether a slide is meant for writing on: titled as an extra or blank slide. */
const forWriting = (title: string) => /\b(extra|blank|template)\b/i.test(title);
const writingSlide = (slides: { id: number; title: string }[]) => slides.find((s) => forWriting(s.title))?.id ?? null;

/** Slides start chosen in new presentations, but not hidden ones or ones meant for writing on. */
const startsChosen = (slide: { title: string; hidden: boolean }) => !slide.hidden && !forWriting(slide.title);

/** Adds a deck to the library. Its slides start chosen, hidden ones and ones for writing on aside. */
export async function addDeck(
  input: { name: string; category: DeckCategory; file: { name: string; bytes: Uint8Array }; preview: Uint8Array | null },
  actor: Actor,
) {
  const info = readUpload(input.file.bytes);
  const pdf = await previewFor(input.file.bytes, info.slides.length, input.preview);
  const fileKey = await storeFile(input.file.bytes);
  const previewKey = await storeFile(pdf);
  const row = one(
    await db
      .insert(decks)
      .values({
        name: input.name,
        category: input.category,
        fileKey,
        fileName: cleanName(input.file.name, "pptx"),
        fileSize: input.file.bytes.length,
        previewKey,
        slides: info.slides.map((s) => ({ ...s, default: startsChosen(s) })),
        font: info.font,
        color: info.color ?? DEFAULT_DECK_COLOR,
        textSlideId: writingSlide(info.slides),
        updatedBy: actor.name,
      })
      .returning(),
  );
  await audit(actor, "create", "deck", row.id, `Added the deck "${row.name}" to the presentations library`);
  return shown(row);
}

/**
 * Puts a newer version of a deck's file in place. Slides still in it keep their names and
 * whether they start chosen; new slides start chosen.
 */
export async function replaceDeckFile(id: number, input: { file: { name: string; bytes: Uint8Array }; preview: Uint8Array | null }, actor: Actor) {
  const old = await deckRow(id);
  const info = readUpload(input.file.bytes);
  const pdf = await previewFor(input.file.bytes, info.slides.length, input.preview);
  const before = new Map(old.slides.map((s) => [s.id, s]));
  const slides: LibrarySlide[] = info.slides.map((s) => {
    const kept = before.get(s.id);
    return kept ? { ...s, title: kept.title || s.title, default: kept.default } : { ...s, default: startsChosen(s) };
  });
  const fileKey = await storeFile(input.file.bytes);
  const previewKey = await storeFile(pdf);
  const row = one(
    await db
      .update(decks)
      .set({
        fileKey,
        fileName: cleanName(input.file.name, "pptx"),
        fileSize: input.file.bytes.length,
        previewKey,
        slides,
        font: info.font ?? old.font,
        textSlideId: slides.some((s) => s.id === old.textSlideId) ? old.textSlideId : writingSlide(info.slides),
        updatedBy: actor.name,
      })
      .where(eq(decks.id, id))
      .returning(),
  );
  await Promise.all([removeStoredFile(old.fileKey), removeStoredFile(old.previewKey)]);
  await audit(actor, "update", "deck", id, `Uploaded a new version of the deck "${row.name}"`);
  return shown(row);
}

export async function updateDeck(id: number, input: z.output<typeof deckUpdate>, actor: Actor) {
  const old = await deckRow(id);
  const changes = new Map((input.slides ?? []).map((s) => [s.id, s]));
  const slides = old.slides.map((s) => {
    const change = changes.get(s.id);
    return change ? { ...s, title: change.title, default: change.default } : s;
  });
  if (input.textSlideId && !slides.some((s) => s.id === input.textSlideId)) throw badRequest("unknownSlide");
  const row = one(
    await db
      .update(decks)
      .set({ ...input, slides: input.slides ? slides : undefined, updatedBy: actor.name })
      .where(eq(decks.id, id))
      .returning(),
  );
  await audit(actor, "update", "deck", id, `Changed the deck "${row.name}"`);
  return shown(row);
}

/** Removes a deck. Presentations that used its slides lose them; their other slides stay. */
export async function deleteDeck(id: number, actor: Actor) {
  const row = one(await db.delete(decks).where(eq(decks.id, id)).returning());
  await Promise.all([row.fileKey, row.previewKey, row.coverImageKey].filter((k): k is string => !!k).map(removeStoredFile));
  await audit(actor, "delete", "deck", id, `Removed the deck "${row.name}" from the presentations library`);
  return { id };
}

/** Reads an uploaded picture: a PNG or JPEG within the size limit. */
function readImage(bytes: Uint8Array): ImageType {
  if (bytes.length === 0) throw badRequest("fileEmpty");
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  const type = sniffType(bytes);
  if (type !== "image/png" && type !== "image/jpeg") throw badRequest("imageType");
  return type;
}

/** The picture behind a deck's cover; none for a cover in the deck's colour. */
export async function setCoverImage(id: number, bytes: Uint8Array | null, actor: Actor) {
  const old = await deckRow(id);
  const type = bytes ? readImage(bytes) : null;
  const key = bytes ? await storeFile(bytes) : null;
  const row = one(await db.update(decks).set({ coverImageKey: key, coverImageType: type, updatedBy: actor.name }).where(eq(decks.id, id)).returning());
  if (old.coverImageKey) await removeStoredFile(old.coverImageKey);
  await audit(actor, "update", "deck", id, `${bytes ? "Set" : "Removed"} the cover picture of the deck "${row.name}"`);
  return shown(row);
}

/** A deck's slide pictures (its PDF), its cover picture, or (for admins) its PowerPoint file. */
export async function deckFile(user: SessionUser, id: number, which: "preview" | "cover" | "pptx") {
  await requireAccess(user);
  const row = await deckRow(id);
  if (which === "preview") return { bytes: await readStoredFile(row.previewKey), type: "application/pdf", name: cleanName(row.fileName, "pdf") };
  if (which === "cover") {
    if (!row.coverImageKey || !row.coverImageType) throw notFound();
    return { bytes: await readStoredFile(row.coverImageKey), type: row.coverImageType, name: "cover" };
  }
  if (!isAdmin(user)) throw notFound();
  return { bytes: await readStoredFile(row.fileKey), type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", name: row.fileName };
}

// ---------------------------------------------------------------- presentations

type PresentationRow = typeof presentations.$inferSelect;

const listed = {
  id: presentations.id,
  title: presentations.title,
  client: presentations.client,
  date: presentations.date,
  deckId: presentations.deckId,
  slides: sql<number>`jsonb_array_length(${presentations.items})`.mapWith(Number),
  createdAt: presentations.createdAt,
  updatedAt: presentations.updatedAt,
};

/** The signed-in person's presentations, latest first. */
export async function listPresentations(user: SessionUser) {
  await requireAccess(user);
  return db.select(listed).from(presentations).where(eq(presentations.ownerId, user.id)).orderBy(desc(presentations.updatedAt));
}

async function owned(user: SessionUser, id: number) {
  await requireAccess(user);
  const [row] = await db
    .select()
    .from(presentations)
    .where(and(eq(presentations.id, id), eq(presentations.ownerId, user.id)));
  if (!row) throw notFound();
  return row;
}

const shownPresentation = (p: PresentationRow) => ({
  id: p.id,
  title: p.title,
  client: p.client,
  contact: p.contact,
  date: p.date,
  presenter: p.presenter,
  deckId: p.deckId,
  items: p.items,
  images: p.images.map((i) => i.key),
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export async function getPresentation(user: SessionUser, id: number) {
  return shownPresentation(await owned(user, id));
}

const newKey = () => randomUUID().slice(0, 8);

/** A new presentation from a deck: its cover, then the deck's slides that start chosen. */
export async function createPresentation(user: SessionUser, input: z.output<typeof presentationCreate>) {
  await requireAccess(user);
  const [deck] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, input.deckId), eq(decks.active, true)));
  if (!deck) throw badRequest("deckMissing");
  const items: PresentationItem[] = [
    { key: newKey(), type: "cover" },
    ...deck.slides.filter((s) => s.default).map((s) => ({ key: newKey(), type: "slide" as const, deckId: deck.id, slideId: s.id })),
  ];
  const { deckId, ...details } = input;
  const row = one(await db.insert(presentations).values({ ...details, deckId, items, ownerId: user.id }).returning());
  return shownPresentation(row);
}

/** Pictures uploaded but no longer on any slide are let go after a while (one may be on its way to a slide). */
const IMAGE_GRACE_MS = 30 * 60_000;

/**
 * Saves changes. A slide must be in the library, or already in the presentation (a slide since
 * taken out of the library may stay until it is removed); a picture must be one uploaded for it.
 */
export async function updatePresentation(user: SessionUser, id: number, input: z.output<typeof presentationUpdate>, now = new Date()) {
  const row = await owned(user, id);
  const { items, ...details } = input;
  let images = row.images;
  if (items) {
    const keys = new Set(row.images.map((i) => i.key));
    const had = new Set(row.items.filter((i) => i.type === "slide").map((i) => `${i.deckId}:${i.slideId}`));
    const deckIds = [...new Set(items.flatMap((i) => (i.type === "slide" ? [i.deckId] : [])))];
    const known = deckIds.length ? await db.select({ id: decks.id, slides: decks.slides }).from(decks).where(inArray(decks.id, deckIds)) : [];
    const inLibrary = new Set(known.flatMap((d) => d.slides.map((s) => `${d.id}:${s.id}`)));
    for (const item of items) {
      if (item.type === "slide" && !inLibrary.has(`${item.deckId}:${item.slideId}`) && !had.has(`${item.deckId}:${item.slideId}`)) throw badRequest("unknownSlide");
      if (item.type === "text" && item.imageKey && !keys.has(item.imageKey)) throw badRequest("unknownImage");
    }
    const used = new Set(items.flatMap((i) => (i.type === "text" && i.imageKey ? [i.imageKey] : [])));
    const stale = row.images.filter((i) => !used.has(i.key) && now.getTime() - new Date(i.at).getTime() > IMAGE_GRACE_MS);
    images = row.images.filter((i) => !stale.includes(i));
    await Promise.all(stale.map((i) => removeStoredFile(i.key)));
  }
  if (details.deckId !== undefined) {
    const [deck] = await db.select({ id: decks.id }).from(decks).where(eq(decks.id, details.deckId));
    if (!deck) throw badRequest("deckMissing");
  }
  const saved = one(
    await db
      .update(presentations)
      .set({ ...details, ...(items ? { items, images } : {}) })
      .where(eq(presentations.id, id))
      .returning(),
  );
  return shownPresentation(saved);
}

/** A copy to change for another client, its pictures copied too. */
export async function duplicatePresentation(user: SessionUser, id: number, copyLabel: string) {
  const row = await owned(user, id);
  const renamed = new Map<string, string>();
  const images = [];
  for (const image of row.images) {
    const key = await storeFile(await readStoredFile(image.key));
    renamed.set(image.key, key);
    images.push({ ...image, key });
  }
  const items = row.items.map((i) => ({ ...i, key: newKey(), ...(i.type === "text" && i.imageKey ? { imageKey: renamed.get(i.imageKey) ?? null } : {}) }));
  const copy = one(
    await db
      .insert(presentations)
      .values({
        ownerId: user.id,
        title: `${row.title} ${copyLabel}`.slice(0, 200),
        client: row.client,
        contact: row.contact,
        date: row.date,
        presenter: row.presenter,
        deckId: row.deckId,
        items,
        images,
      })
      .returning(),
  );
  return shownPresentation(copy);
}

export async function deletePresentation(user: SessionUser, id: number) {
  const row = await owned(user, id);
  await db.delete(presentations).where(eq(presentations.id, id));
  await Promise.all(row.images.map((i) => removeStoredFile(i.key)));
  return { id };
}

const MAX_IMAGES = 60;

/** A picture for one of the presentation's own slides. */
export async function addPresentationImage(user: SessionUser, id: number, bytes: Uint8Array, now = new Date()) {
  const row = await owned(user, id);
  const type = readImage(bytes);
  if (row.images.length >= MAX_IMAGES) throw badRequest("tooManyImages");
  const key = await storeFile(bytes);
  await db
    .update(presentations)
    .set({ images: [...row.images, { key, type, at: now.toISOString() }] })
    .where(eq(presentations.id, id));
  return { key };
}

export async function presentationImage(user: SessionUser, id: number, key: string) {
  const row = await owned(user, id);
  const image = row.images.find((i) => i.key === key);
  if (!image) throw notFound();
  return { bytes: await readStoredFile(image.key), type: image.type };
}

// ---------------------------------------------------------------- the file

let logos: Promise<{ white: Uint8Array; color: Uint8Array }> | null = null;
const assets = (name: string) => readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "src/server/pptx/assets", name)).then((b) => new Uint8Array(b));
const companyLogos = () => (logos ??= Promise.all([assets("applus-white.png"), assets("applus-logo.png")]).then(([white, color]) => ({ white, color })));

const longDate = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/**
 * The presentation as a PowerPoint file, or a PDF of it. Slides since taken out of the library
 * are left out. Each download is counted for Settings → Tools.
 */
export async function presentationFile(user: SessionUser, id: number, format: "pptx" | "pdf") {
  const row = await owned(user, id);
  const wanted = new Set<number>(row.items.flatMap((i) => (i.type === "slide" ? [i.deckId] : [])));
  if (row.deckId) wanted.add(row.deckId);
  const rows = wanted.size ? await db.select().from(decks).where(inArray(decks.id, [...wanted])) : [];
  const byId = new Map(rows.map((d) => [d.id, d]));
  const hasSlide = (deckId: number, slideId: number) => byId.get(deckId)?.slides.some((s) => s.id === slideId) ?? false;

  const firstSlide = row.items.find((i) => i.type === "slide" && hasSlide(i.deckId, i.slideId));
  const main = (row.deckId ? byId.get(row.deckId) : undefined) ?? (firstSlide?.type === "slide" ? byId.get(firstSlide.deckId) : undefined);
  if (!main) throw badRequest("noDeck");

  const style = { color: main.color, font: main.font };
  const date = row.date ? longDate(row.date) : null;
  const pictures = new Map(row.images.map((i) => [i.key, i]));
  const picture = async (key: string | null): Promise<Image | null> => {
    const image = key ? pictures.get(key) : undefined;
    return image ? { bytes: await readStoredFile(image.key), type: image.type } : null;
  };
  const items: Item[] = [];
  for (const item of row.items) {
    if (item.type === "cover") {
      const background = main.coverImageKey && main.coverImageType ? { bytes: await readStoredFile(main.coverImageKey), type: main.coverImageType as ImageType } : null;
      items.push({
        kind: "cover",
        deck: String(main.id),
        cover: { ...style, title: row.title, client: row.client, contact: row.contact, date, presenter: row.presenter, background },
      });
    } else if (item.type === "slide") {
      if (hasSlide(item.deckId, item.slideId)) items.push({ kind: "slide", deck: String(item.deckId), slideId: item.slideId });
    } else {
      items.push({
        kind: "text",
        deck: String(main.id),
        text: { ...style, title: item.title, body: item.body, image: await picture(item.imageKey), baseSlideId: main.textSlideId },
      });
    }
  }
  if (items.length === 0) throw badRequest("noSlides");

  const used = new Set(items.map((i) => i.deck));
  const sources = new Map<string, Uint8Array>();
  for (const deck of rows) if (used.has(String(deck.id))) sources.set(String(deck.id), await readStoredFile(deck.fileKey));

  let bytes: Uint8Array;
  try {
    bytes = buildPresentation(sources, items, {
      values: { client: row.client, contact: row.contact ?? undefined, date: date ?? undefined, presenter: row.presenter ?? undefined, title: row.title },
      title: row.title,
      logos: await companyLogos(),
    });
  } catch (error) {
    if ((error as Error).message === "missingSlide") throw badRequest("missingSlide");
    throw error;
  }
  if (format === "pdf") {
    try {
      bytes = await toPdf(bytes);
    } catch (error) {
      throw badRequest((error as Error).message === "officeMissing" ? "pdfUnavailable" : "pdfFailed");
    }
  }
  await db.insert(toolUses).values({ tool: "presentations", userId: user.id });
  return {
    bytes,
    name: cleanName(`${row.title} - ${row.client}`, format),
    type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
}
