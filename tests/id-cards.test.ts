import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ONBOARDING_TASKS } from "@/lib/domain";
import { type CardText, firstAndLast, layoutCard, SIZES, TEXT } from "@/lib/id-card";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ap-it-cards-"));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const cards = await import("@/server/services/id-cards");
const people = await import("@/server/services/people");
const { cardPdf, pdfMeasure } = await import("@/server/id-card-pdf");

/** A real PNG of a flat colour, as big as asked. */
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3, 0xc8);
  row[0] = 0;
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]),
  );
}

const PHOTO = png(600, 600);
const DESIGN = png(630, 1000);
const PDF = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let it_: User;
let employee: User;
let measure: Awaited<ReturnType<typeof pdfMeasure>>;

beforeAll(async () => {
  await seedDemo(NOW);
  [admin, it_, employee] = await Promise.all(["admin@applus.test", "it@applus.test", "employee@applus.test"].map(asUser));
  measure = await pdfMeasure();
}, 120_000);

const text = (over: Partial<CardText> = {}): CardText => ({
  name: "Sara Al-Harbi",
  designation: "Claims Officer",
  number: "1234",
  nameFont: "auto",
  nameSize: null,
  designationFont: "auto",
  designationSize: null,
  ...over,
});

describe("fitting the text", () => {
  it("sets a short name, designation and ID number in the regular font at the default sizes", () => {
    const [name, designation, number] = layoutCard(text(), measure);
    expect(name).toMatchObject({ text: "Sara Al-Harbi", font: "regular", bold: true, size: SIZES.name.default });
    expect(designation).toMatchObject({ text: "Claims Officer", font: "regular", bold: false, size: SIZES.designation.default });
    expect(number).toMatchObject({ text: "ID: 1234", bold: true });
    expect(name.y).toBeLessThan(designation.y);
    expect(designation.y).toBeLessThan(number.y);
  });

  it("switches a long name to the narrow font rather than shrinking it too far", () => {
    const [name, designation] = layoutCard(
      text({ name: "Mohammed Abdulrahman Al-Ghamdi", designation: "Senior Insurance Operations Supervisor" }),
      measure,
    );
    expect(name).toMatchObject({ text: "Mohammed Abdulrahman Al-Ghamdi", font: "narrow" });
    expect(designation.font).toBe("narrow");
  });

  it("wraps a name too long for one line onto two, most evenly, stacking upwards", () => {
    const lines = layoutCard(text({ name: "Abdullah Mohammed Abdulrahman Saleh Al-Qahtani Al-Dosari", designation: "" }), measure);
    const names = lines.filter((l) => l.kind === "name");
    expect(names.map((l) => l.text)).toEqual(["Abdullah Mohammed Abdulrahman", "Saleh Al-Qahtani Al-Dosari"]);
    expect(names[0].y).toBeLessThan(names[1].y);
  });

  it("never lets a line reach past the blue line, whatever it says", () => {
    const names = ["A", "Noura Al-Otaibi", "Mohammed Abdulrahman Al-Ghamdi", "Faisal Bin Abdulaziz Bin Mohammed Al-Saud Al-Kabeer", "W".repeat(40)];
    for (const name of names) {
      for (const line of layoutCard(text({ name, designation: name }), measure)) {
        if (line.text.includes(" ")) expect(measure(line.text, line.font, line.bold, line.size)).toBeLessThanOrEqual(TEXT.maxWidth + 1e-6);
      }
    }
  });

  it("keeps the font and size IT chooses, shrinking only when the text cannot fit", () => {
    const [name] = layoutCard(text({ nameFont: "narrow", nameSize: 9.5 }), measure);
    expect(name).toMatchObject({ font: "narrow", size: 9.5 });
    const [long] = layoutCard(text({ name: "Mohammed Abdulrahman Al-Ghamdi", nameFont: "regular", nameSize: 10 }), measure);
    expect(long.font).toBe("regular");
    expect(long.size).toBeLessThan(10);
  });

  it("leaves out the ID line without a number, and middle names on request", () => {
    expect(layoutCard(text({ number: null }), measure).some((l) => l.kind === "number")).toBe(false);
    expect(firstAndLast("Mohammed Abdulrahman Saleh Al-Ghamdi")).toBe("Mohammed Al-Ghamdi");
    expect(firstAndLast("  Sara   Al-Harbi ")).toBe("Sara Al-Harbi");
  });
});

describe("the printed card", () => {
  it("prints each side as one card-sized page, the text only on the front", async () => {
    const front = await PDFDocument.load(await cardPdf("front", { ...text(), title: "ID card" }, { bytes: DESIGN, type: "image/png" }, { bytes: PHOTO, type: "image/png" }));
    const back = await PDFDocument.load(await cardPdf("back", { ...text(), title: "ID card" }, { bytes: DESIGN, type: "image/png" }, null));
    for (const pdf of [front, back]) {
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getSize()).toEqual({ width: 153, height: 243 });
    }
    const fonts = (pdf: PDFDocument) => pdf.context.enumerateIndirectObjects().filter(([, o]) => String(o).includes("/FontFile2")).length;
    expect(fonts(front)).toBeGreaterThan(0);
    expect(fonts(back)).toBe(0);
  });
});

describe("the card design", () => {
  it("takes a portrait image in the card's proportions, replacing the file it had", async () => {
    await expect(cards.setDesign("front", PDF, admin)).rejects.toMatchObject({ status: 400, message: "designType" });
    await expect(cards.setDesign("front", png(1000, 630), admin)).rejects.toMatchObject({ message: "designShape" });
    await expect(cards.setDesign("front", png(315, 500), admin)).rejects.toMatchObject({ message: "designSmall" });

    await cards.setDesign("front", DESIGN, admin);
    const [first] = await db.select().from(s.settings).where(eq(s.settings.key, "id_card_template"));
    const firstKey = (first.value as { front: { key: string } }).front.key;
    const info = await cards.setDesign("front", DESIGN, admin, new Date(NOW.getTime() + 1000));
    expect(info.front).toMatchObject({ width: 630, height: 1000 });
    expect(info.back).toBeNull();
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, firstKey))).toBe(false);
    expect((await cards.designImage("front"))?.type).toBe("image/png");

    await cards.setDesign("back", DESIGN, admin);
    expect((await cards.removeDesign("back", admin)).back).toBeNull();
    await expect(cards.removeDesign("back", admin)).rejects.toMatchObject({ status: 404 });
  });
});

describe("an employee asking for a new card", () => {
  it("checks the photo is an image, square and sharp enough", async () => {
    const ask = (photo: Uint8Array) => cards.requestCard(employee, { reason: "lost", note: null, photo });
    await expect(ask(PDF)).rejects.toMatchObject({ status: 400, message: "photoType" });
    await expect(ask(png(600, 400))).rejects.toMatchObject({ message: "photoShape" });
    await expect(ask(png(200, 200))).rejects.toMatchObject({ message: "photoSmall" });
  });

  it("opens a ticket for IT, with a card carrying their details from the directory", async () => {
    const before = await cards.myCardRequest(employee);
    expect(before.waiting).toBeNull();
    const [record] = await db.select().from(s.employees).where(eq(s.employees.id, employee.employeeId!));
    expect(before.details).toEqual({ name: record.name, designation: record.jobTitle, number: record.employeeNumber });

    const { id, ticketId } = await cards.requestCard(employee, { reason: "damaged", note: "Cracked in half.", photo: PHOTO });
    const [ticket] = await db.select().from(s.tickets).where(eq(s.tickets.id, ticketId));
    expect(ticket).toMatchObject({
      type: "request",
      subject: "New ID card (damaged)",
      description: "My ID card is damaged.\n\nCracked in half.",
      issueType: "id_card",
      requesterId: record.id,
      location: record.location,
      status: "open",
    });
    const card = await cards.getCard(id);
    expect(card).toMatchObject({ name: record.name, designation: record.jobTitle, number: record.employeeNumber, status: "requested", hasPhoto: true, ticketId });
    expect(card.record).toMatchObject({ kind: "employee", id: record.id });
    expect((await cards.myCardRequest(employee)).waiting).toMatchObject({ id, ticketId });
  });

  it("allows one request at a time", async () => {
    await expect(cards.requestCard(employee, { reason: "lost", note: null, photo: PHOTO })).rejects.toMatchObject({ status: 409, message: "cardWaiting" });
  });

  it("needs an employee record", async () => {
    await expect(cards.myCardRequest({ ...employee, employeeId: null })).rejects.toMatchObject({ status: 403 });
  });
});

describe("IT printing a card", () => {
  it("adjusts the card without changing the record, and prints it with the photo", async () => {
    const [{ id }] = await db.select().from(s.idCards).where(eq(s.idCards.employeeId, employee.employeeId!));
    await cards.updateCard(id, { name: "Short Name", nameFont: "narrow", nameSize: 9 }, it_);
    const card = await cards.getCard(id);
    expect(card).toMatchObject({ name: "Short Name", nameFont: "narrow", nameSize: 9 });
    expect(card.record.name).not.toBe("Short Name");

    const front = await cards.cardPdfFor(id, "front");
    expect(front.name).toBe("Short Name");
    const pdf = await PDFDocument.load(front.bytes);
    expect(pdf.getTitle()).toBe("ID card: Short Name (front)");
    expect((await cards.cardPhoto(id)).type).toBe("image/png");
  });

  it("resolves the employee's ticket when printed, taking it if nobody had, and lets them know", async () => {
    const [card] = await db.select().from(s.idCards).where(eq(s.idCards.employeeId, employee.employeeId!));
    const printed = await cards.markPrinted(card.id, it_, NOW);
    expect(printed).toMatchObject({ status: "printed", printedBy: it_.name });
    const [ticket] = await db.select().from(s.tickets).where(eq(s.tickets.id, card.ticketId!));
    expect(ticket).toMatchObject({ status: "resolved", assigneeId: it_.id });
    expect(ticket.resolution).toMatch(/^Your new ID card is printed and ready to collect from IT\./);
    const mail = await db.select().from(s.emails).where(and(eq(s.emails.ticketId, ticket.id), eq(s.emails.kind, "resolution")));
    expect(mail).toHaveLength(1);
    await expect(cards.markPrinted(card.id, it_)).rejects.toMatchObject({ status: 400, message: "alreadyPrinted" });
    expect((await cards.myCardRequest(employee)).waiting).toBeNull();
  });

  it("replaces a photo and removes the old file, and removes the file with the card", async () => {
    const [record] = await db.select().from(s.employees).where(eq(s.employees.email, "it@applus.test"));
    const card = await cards.createCard({ employeeId: record.id, joinerId: null, reason: "details_changed" }, it_);
    expect(card).toMatchObject({ name: record.name, designation: record.jobTitle, reason: "details_changed", ticketId: null });
    expect((await cards.createCard({ employeeId: record.id, joinerId: null, reason: "lost" }, it_)).id).toBe(card.id);

    await expect(cards.setCardPhoto(card.id, png(500, 600), it_)).rejects.toMatchObject({ message: "photoShape" });
    const first = await cards.setCardPhoto(card.id, PHOTO, it_);
    const second = await cards.setCardPhoto(card.id, PHOTO, it_);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, first.photoKey!))).toBe(false);
    await cards.deleteCard(card.id, it_);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, second.photoKey!))).toBe(false);
    await expect(cards.getCard(card.id)).rejects.toMatchObject({ status: 404 });
  });

  it("ticks a joiner's onboarding step when printed, and moves the card to their directory entry", async () => {
    const tasks = Object.fromEntries(ONBOARDING_TASKS.map((t) => [t.key, t.key !== "print_id_card"]));
    const joiner = await people.createJoiner(
      { name: "Yara Al-Mutairi", email: "yara@applus.test", department: "sales", location: "riyadh", jobTitle: "Account Manager", employeeNumber: "2044", startDate: "2026-10-04" },
      it_,
    );
    await people.updateJoinerTasks(joiner.id, { tasks }, it_);
    const card = await cards.createCard({ employeeId: null, joinerId: joiner.id, reason: "new_joiner" }, it_);
    expect(card).toMatchObject({ name: "Yara Al-Mutairi", designation: "Account Manager", number: "2044", employeeId: null });
    expect((await cards.getCard(card.id)).record).toMatchObject({ kind: "joiner", id: joiner.id });

    await cards.markPrinted(card.id, it_);
    const [after] = await db.select().from(s.joiners).where(eq(s.joiners.id, joiner.id));
    expect(after.tasks.print_id_card).toBe(true);
    const done = await people.completeJoiner(joiner.id, it_);
    const [moved] = await db.select().from(s.idCards).where(eq(s.idCards.id, card.id));
    expect(moved.employeeId).toBe(done.employeeId);
    expect((await cards.listCards()).find((c) => c.id === card.id)).toMatchObject({ personName: "Yara Al-Mutairi", hasPhoto: false });
  });
});
