import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { z } from "zod";
import type { IdCardReason } from "@/lib/domain";
import { MAX_UPLOAD_BYTES, imageSize, sniffType } from "@/lib/files";
import { CARD, type CardSide, cardStage, DESIGN_MIN_WIDTH, PHOTO_PIXELS } from "@/lib/id-card";
import type { idCardCreate, idCardUpdate } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { employees, idCards, joiners, settings, tickets } from "../db/schema";
import { readStoredFile, removeStoredFile, storeFile } from "../files";
import { badRequest, forbidden, HttpError, notFound, one } from "../http";
import { cardPdf } from "../id-card-pdf";
import { createTicket, updateTicket } from "./tickets";

type Image = { bytes: Uint8Array; type: "image/png" | "image/jpeg" };

/** An uploaded image, checked by its content: a PNG or JPEG whose size can be read. */
function readImage(bytes: Uint8Array, typeError: string) {
  if (bytes.length === 0) throw badRequest("fileEmpty");
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  const type = sniffType(bytes);
  const size = imageSize(bytes);
  if ((type !== "image/png" && type !== "image/jpeg") || !size) throw badRequest(typeError);
  return { type, ...size };
}

// ---------------------------------------------------------------- the card design

const TEMPLATE_KEY = "id_card_template";
type DesignSide = { key: string; type: Image["type"]; width: number; height: number; updatedAt: string };
type Design = Partial<Record<CardSide, DesignSide>>;

async function getDesign(): Promise<Design> {
  const [row] = await db.select().from(settings).where(eq(settings.key, TEMPLATE_KEY));
  return (row?.value as Design | undefined) ?? {};
}

async function putDesign(value: Design) {
  await db
    .insert(settings)
    .values({ key: TEMPLATE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Which sides of the design are uploaded, and when, so pages can load the current image. */
export async function designInfo() {
  const design = await getDesign();
  const info = (side: CardSide) => {
    const d = design[side];
    return d ? { width: d.width, height: d.height, updatedAt: d.updatedAt } : null;
  };
  return { front: info("front"), back: info("back") };
}

export async function designImage(side: CardSide): Promise<Image | null> {
  const d = (await getDesign())[side];
  return d ? { bytes: await readStoredFile(d.key), type: d.type } : null;
}

/**
 * Replaces one side of the company design: a portrait image in the card's proportions, large
 * enough to print sharp. It is printed full bleed, so its edges are the card's edges.
 */
export async function setDesign(side: CardSide, bytes: Uint8Array, actor: Actor, now = new Date()) {
  const image = readImage(bytes, "designType");
  if (Math.abs(image.width / image.height - CARD.width / CARD.height) > 0.02) throw badRequest("designShape");
  if (image.width < DESIGN_MIN_WIDTH) throw badRequest("designSmall");
  const design = await getDesign();
  const key = await storeFile(bytes, now);
  await putDesign({ ...design, [side]: { key, type: image.type, width: image.width, height: image.height, updatedAt: now.toISOString() } });
  if (design[side]) await removeStoredFile(design[side].key);
  await audit(actor, "update", "settings", TEMPLATE_KEY, `Uploaded the ID card design (${side})`);
  return designInfo();
}

export async function removeDesign(side: CardSide, actor: Actor) {
  const design = await getDesign();
  const current = design[side];
  if (!current) throw notFound();
  delete design[side];
  await putDesign(design);
  await removeStoredFile(current.key);
  await audit(actor, "update", "settings", TEMPLATE_KEY, `Removed the ID card design (${side})`);
  return designInfo();
}

// ---------------------------------------------------------------- photos

/**
 * A photo as the card takes it: square (the page crops it to the photo window) and with enough
 * pixels to print sharp. Errors name the problem for the page to explain.
 */
function checkPhoto(bytes: Uint8Array): Image {
  const image = readImage(bytes, "photoType");
  if (Math.abs(image.width - image.height) > 1) throw badRequest("photoShape");
  if (image.width < PHOTO_PIXELS.needed) throw badRequest("photoSmall");
  return { bytes, type: image.type };
}

// ---------------------------------------------------------------- cards

const listed = {
  ...getTableColumns(idCards),
  personName: sql<string>`coalesce(${employees.name}, ${joiners.name})`,
  department: sql<string>`coalesce(${employees.department}, ${joiners.department})`,
  ticketStatus: tickets.status,
  ticketClosedAt: tickets.closedAt,
};

const withPeople = () =>
  db
    .select(listed)
    .from(idCards)
    .leftJoin(employees, eq(employees.id, idCards.employeeId))
    .leftJoin(joiners, eq(joiners.id, idCards.joinerId))
    .leftJoin(tickets, eq(tickets.id, idCards.ticketId));

/** Every card, newest first, with who it is for. */
export async function listCards() {
  const rows = await withPeople().orderBy(desc(idCards.createdAt), desc(idCards.id));
  return rows.map(({ photoKey, ...row }) => ({ ...row, hasPhoto: photoKey !== null, stage: cardStage(row) }));
}

/** What the person's record says, for a new card and for putting an adjusted one back. */
async function recordOf(card: { employeeId: number | null; joinerId: number | null }) {
  if (card.employeeId) {
    const [e] = await db.select().from(employees).where(eq(employees.id, card.employeeId));
    if (e) return { kind: "employee" as const, id: e.id, name: e.name, designation: e.jobTitle, number: e.employeeNumber };
  }
  if (card.joinerId) {
    const [j] = await db.select().from(joiners).where(eq(joiners.id, card.joinerId));
    if (j) return { kind: "joiner" as const, id: j.id, name: j.name, designation: j.jobTitle, number: j.employeeNumber };
  }
  throw notFound();
}

/** One card with the record it copies and the design to show it on. */
export async function getCard(id: number) {
  const [row] = await withPeople().where(eq(idCards.id, id));
  if (!row) throw notFound();
  const { photoKey, ...card } = row;
  const [record, design] = await Promise.all([recordOf(card), designInfo()]);
  return { ...card, hasPhoto: photoKey !== null, stage: cardStage(card), record, design };
}

async function cardRow(id: number) {
  return one(await db.select().from(idCards).where(eq(idCards.id, id)));
}

/**
 * IT starting a card for someone in the directory or a joiner. A card still waiting to be printed
 * for the same person is returned instead of a second one.
 */
export async function createCard(input: z.infer<typeof idCardCreate>, actor: Actor) {
  const person = input.employeeId ? eq(idCards.employeeId, input.employeeId) : eq(idCards.joinerId, input.joinerId!);
  const [waiting] = await db
    .select()
    .from(idCards)
    .where(and(person, eq(idCards.status, "requested")))
    .orderBy(desc(idCards.id))
    .limit(1);
  if (waiting) return waiting;

  let employeeId = input.employeeId;
  if (input.joinerId) {
    const [joiner] = await db.select().from(joiners).where(eq(joiners.id, input.joinerId));
    if (!joiner) throw notFound();
    employeeId = joiner.employeeId; // set once onboarding has added them to the directory
  }
  const record = await recordOf({ employeeId, joinerId: input.joinerId });
  const row = one(
    await db
      .insert(idCards)
      .values({
        employeeId,
        joinerId: input.joinerId,
        reason: input.reason,
        name: record.name,
        designation: record.designation,
        number: record.number,
        createdBy: actor.id,
      })
      .returning(),
  );
  await audit(actor, "create", "id_card", row.id, `Started an ID card for ${record.name}`);
  return row;
}

export async function updateCard(id: number, input: z.infer<typeof idCardUpdate>, actor: Actor) {
  const row = one(await db.update(idCards).set(input).where(eq(idCards.id, id)).returning());
  await audit(actor, "update", "id_card", id, `Adjusted the ID card for ${row.name}`);
  return row;
}

/** Replaces the card's photo with one already arranged for the photo window. */
export async function setCardPhoto(id: number, bytes: Uint8Array, actor: Actor) {
  checkPhoto(bytes);
  const current = await cardRow(id);
  const photoKey = await storeFile(bytes);
  const row = one(await db.update(idCards).set({ photoKey }).where(eq(idCards.id, id)).returning());
  if (current.photoKey) await removeStoredFile(current.photoKey);
  await audit(actor, "update", "id_card", id, `Changed the photo on the ID card for ${row.name}`);
  return row;
}

export async function cardPhoto(id: number): Promise<Image> {
  const card = await cardRow(id);
  if (!card.photoKey) throw notFound();
  const bytes = new Uint8Array(await readStoredFile(card.photoKey));
  return { bytes, type: sniffType(bytes) === "image/png" ? "image/png" : "image/jpeg" };
}

/** One side of the card, ready for the card printer. */
export async function cardPdfFor(id: number, side: CardSide) {
  const card = await cardRow(id);
  const [design, photo] = await Promise.all([designImage(side), side === "front" && card.photoKey ? cardPhoto(id) : null]);
  return { name: card.name, bytes: await cardPdf(side, { ...card, title: `ID card: ${card.name}` }, design, photo) };
}

const PRINTED_NOTE =
  "Your new ID card is printed and ready to collect from IT.\n\nبطاقة الهوية الجديدة مطبوعة وجاهزة للاستلام من قسم تقنية المعلومات.";

/**
 * The card is printed: an employee's request is resolved (so they hear it is ready, and confirm
 * once they have it), and a joiner's onboarding step is ticked.
 */
export async function markPrinted(id: number, user: SessionUser, now = new Date()) {
  const card = await cardRow(id);
  if (card.status === "printed") throw badRequest("alreadyPrinted");
  const row = one(
    await db.update(idCards).set({ status: "printed", printedAt: now, printedBy: user.name }).where(eq(idCards.id, id)).returning(),
  );
  await audit(user, "print", "id_card", id, `Printed the ID card for ${row.name}`);

  if (card.ticketId) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, card.ticketId));
    if (ticket && ticket.status !== "resolved" && ticket.status !== "closed") {
      await updateTicket(user, ticket.id, {
        status: "resolved",
        resolution: PRINTED_NOTE,
        ...(ticket.assigneeId ? {} : { assigneeId: user.id }),
      });
    }
  }
  if (card.joinerId) {
    const [joiner] = await db.select().from(joiners).where(eq(joiners.id, card.joinerId));
    if (joiner && !joiner.completedAt && !joiner.tasks.print_id_card) {
      await db.update(joiners).set({ tasks: { ...joiner.tasks, print_id_card: true } }).where(eq(joiners.id, joiner.id));
    }
  }
  return row;
}

/**
 * IT hands over a card nobody asked for, such as a joiner's. A card someone asked for is handed
 * over when they confirm they have it, which closes their request.
 */
export async function markHandedOver(id: number, actor: Actor, now = new Date()) {
  const card = await cardRow(id);
  if (card.status !== "printed") throw badRequest("notPrinted");
  if (card.ticketId) throw badRequest("confirmedByRequester");
  if (card.handedOverAt) throw badRequest("alreadyHandedOver");
  const row = one(await db.update(idCards).set({ handedOverAt: now, handedOverBy: actor.name }).where(eq(idCards.id, id)).returning());
  await audit(actor, "update", "id_card", id, `Handed over the ID card for ${row.name}`);
  return row;
}

export async function deleteCard(id: number, actor: Actor) {
  const row = one(await db.delete(idCards).where(eq(idCards.id, id)).returning());
  if (row.photoKey) await removeStoredFile(row.photoKey);
  await audit(actor, "delete", "id_card", id, `Deleted the ID card for ${row.name}`);
  return { id };
}

// ---------------------------------------------------------------- employees asking for a card

const SUBJECT: Record<IdCardReason, string> = {
  lost: "New ID card (lost)",
  damaged: "New ID card (damaged)",
  details_changed: "New ID card (details changed)",
  new_joiner: "New ID card (new joiner)",
  other: "New ID card",
};

const REASON_TEXT: Record<IdCardReason, string> = {
  lost: "My ID card was lost.",
  damaged: "My ID card is damaged.",
  details_changed: "My details have changed.",
  new_joiner: "I have joined and need an ID card.",
  other: "I need a new ID card.",
};

async function myEmployee(user: SessionUser) {
  if (!user.employeeId) throw forbidden("Your account is not linked to an employee record");
  const [employee] = await db.select().from(employees).where(eq(employees.id, user.employeeId));
  if (!employee) throw forbidden("Your account is not linked to an employee record");
  return employee;
}

/** What the request page needs: the details the card will carry, and any request still with IT. */
export async function myCardRequest(user: SessionUser) {
  const employee = await myEmployee(user);
  return {
    details: { name: employee.name, designation: employee.jobTitle, number: employee.employeeNumber },
    waiting: await waitingFor(employee.id),
    design: await designInfo(),
  };
}

/** A person's card request still with IT, if any. */
async function waitingFor(employeeId: number) {
  const [waiting] = await db
    .select({ id: idCards.id, ticketId: idCards.ticketId, createdAt: idCards.createdAt })
    .from(idCards)
    .where(and(eq(idCards.employeeId, employeeId), eq(idCards.status, "requested")))
    .orderBy(desc(idCards.id))
    .limit(1);
  return waiting ?? null;
}

/** The person's latest printed card, the one they hold now. */
async function latestPrinted(employeeId: number) {
  const [card] = await db
    .select({ ...getTableColumns(idCards), ticketStatus: tickets.status, ticketClosedAt: tickets.closedAt })
    .from(idCards)
    .leftJoin(tickets, eq(tickets.id, idCards.ticketId))
    .where(and(eq(idCards.employeeId, employeeId), eq(idCards.status, "printed")))
    .orderBy(desc(idCards.printedAt), desc(idCards.id))
    .limit(1);
  return card ?? null;
}

/**
 * For the employee's dashboard: the card they were handed, exactly as it was printed, and any
 * request still with IT.
 */
export async function myCard(user: SessionUser) {
  const employee = await myEmployee(user);
  const [card, waiting, design] = await Promise.all([latestPrinted(employee.id), waitingFor(employee.id), designInfo()]);
  const printed = card && {
    id: card.id,
    name: card.name,
    designation: card.designation,
    number: card.number,
    nameFont: card.nameFont,
    nameSize: card.nameSize,
    designationFont: card.designationFont,
    designationSize: card.designationSize,
    hasPhoto: card.photoKey !== null,
    printedAt: card.printedAt,
    updatedAt: card.updatedAt,
    // Ready to collect until they confirm they have it (closing the request), or IT says so.
    stage: cardStage(card),
    handedOverAt: card.handedOverAt ?? (card.ticketStatus === "closed" ? card.ticketClosedAt : null),
    ticketId: card.ticketId,
  };
  return { printed, waiting, design };
}

/** The photo on the employee's own printed card; they see no other. */
export async function myCardPhoto(user: SessionUser) {
  const employee = await myEmployee(user);
  const card = await latestPrinted(employee.id);
  if (!card?.photoKey) throw notFound();
  return cardPhoto(card.id);
}

/**
 * An employee asking for a new card with their photo, already arranged. It opens a ticket, so the
 * request reaches IT like any other, and the card carries their details from the directory.
 */
export async function requestCard(user: SessionUser, input: { reason: IdCardReason; note: string | null; photo: Uint8Array }) {
  const employee = await myEmployee(user);
  checkPhoto(input.photo);
  const [waiting] = await db
    .select({ id: idCards.id })
    .from(idCards)
    .where(and(eq(idCards.employeeId, employee.id), eq(idCards.status, "requested")));
  if (waiting) throw new HttpError(409, "cardWaiting");

  const photoKey = await storeFile(input.photo);
  const ticket = await createTicket(user, {
    type: "request",
    subject: SUBJECT[input.reason],
    description: input.note ? `${REASON_TEXT[input.reason]}\n\n${input.note}` : REASON_TEXT[input.reason],
    issueType: "id_card",
    location: employee.location,
    priority: "medium",
    requesterId: employee.id,
    assigneeId: null,
    assetId: null,
  });
  const row = one(
    await db
      .insert(idCards)
      .values({
        employeeId: employee.id,
        ticketId: ticket.id,
        reason: input.reason,
        note: input.note,
        photoKey,
        name: employee.name,
        designation: employee.jobTitle,
        number: employee.employeeNumber,
        createdBy: user.id,
      })
      .returning(),
  );
  await audit(user, "create", "id_card", row.id, `Requested an ID card for ${employee.name}`);
  return { id: row.id, ticketId: ticket.id };
}
