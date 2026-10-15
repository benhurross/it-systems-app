import { createServer, type Server } from "node:net";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { printTags, sendToPrinter, testPrint } = await import("@/server/services/asset-tags");
const { putSetting } = await import("@/server/settings");

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let ids: number[];

/** A stand-in for a networked Zebra: takes what is sent to its raw port. */
let printer: Server;
let port: number;
const received: string[] = [];

beforeAll(async () => {
  await seedDemo(NOW);
  admin = await asUser("admin@applus.test");
  ids = (await db.select({ id: s.assets.id }).from(s.assets).orderBy(s.assets.id).limit(3)).map((r) => r.id);
  printer = createServer((socket) => {
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString("latin1")));
    socket.on("end", () => received.push(data));
  });
  await new Promise<void>((resolve) => printer.listen(0, "127.0.0.1", resolve));
  port = (printer.address() as { port: number }).port;
}, 120_000);

afterAll(() => {
  printer.close();
});

const origin = "http://localhost:3200";
const printerSetting = (host: string, p = port) => ({ host, port: p, widthMm: 50, heightMm: 25, dpi: 203, owner: "AP Plus IT" });

describe("asset tags", () => {
  it("makes a PDF of the tags, as many copies as asked, and records that they were printed", async () => {
    const out = await printTags({ ids, copies: 2, output: "pdf" }, origin, admin);
    expect(out).toMatchObject({ kind: "file", type: "application/pdf", name: "asset-tags.pdf" });
    if (out.kind !== "file") throw new Error();
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(6);

    const rows = await db.select({ id: s.assets.id, at: s.assets.tagPrintedAt }).from(s.assets).where(inArray(s.assets.id, ids));
    expect(rows.every((r) => r.at instanceof Date)).toBe(true);
    const [entry] = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "print_tags")).orderBy(desc(s.auditLog.id)).limit(1);
    expect(entry.summary).toMatch(/^Printed tags for AST-\d{4}, AST-\d{4}, AST-\d{4} as a PDF$/);
  });

  it("previews one tag without counting it as printed", async () => {
    const [untagged] = await db.select({ id: s.assets.id }).from(s.assets).orderBy(desc(s.assets.id)).limit(1);
    const out = await printTags({ ids: [untagged.id], copies: 1, output: "preview" }, origin, admin);
    expect(out).toMatchObject({ kind: "file", inline: true });
    const [row] = await db.select({ at: s.assets.tagPrintedAt }).from(s.assets).where(eq(s.assets.id, untagged.id));
    expect(row.at).toBeNull();
  });

  it("writes a ZPL file whose QR codes lead to the asset's short address", async () => {
    const out = await printTags({ ids: [ids[0]], copies: 1, output: "zpl" }, origin, admin);
    if (out.kind !== "file") throw new Error();
    expect(out).toMatchObject({ name: "asset-tags.zpl", inline: false });
    const zpl = new TextDecoder().decode(out.bytes);
    expect(zpl).toMatch(/^\^XA/);
    expect(zpl).toContain(`^FDAST-${String(ids[0]).padStart(4, "0")}^FS`);
    expect(zpl).toContain("^FDAP Plus IT^FS");
  });

  it("sends the tags to the label printer", async () => {
    await putSetting("labelPrinter", printerSetting("127.0.0.1"), admin);
    received.length = 0;
    expect(await printTags({ ids, copies: 1, output: "printer" }, origin, admin)).toEqual({ kind: "printed", count: 3 });
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0].match(/\^XA/g)).toHaveLength(3);

    await testPrint(origin, admin);
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]).toContain("^FDAST-0000^FS");
  });

  it("says when no printer is set up, or the printer does not answer", async () => {
    await putSetting("labelPrinter", printerSetting(""), admin);
    await expect(printTags({ ids, copies: 1, output: "printer" }, origin, admin)).rejects.toMatchObject({ status: 400, message: "noPrinter" });
    await expect(testPrint(origin, admin)).rejects.toMatchObject({ message: "noPrinter" });

    // A port nothing listens on.
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const deadPort = (closed.address() as { port: number }).port;
    await new Promise((resolve) => closed.close(resolve));
    await expect(sendToPrinter("127.0.0.1", deadPort, "^XA^XZ")).rejects.toMatchObject({ status: 502, message: "printerUnreachable" });
  });

  it("refuses assets that do not exist", async () => {
    await expect(printTags({ ids: [ids[0], 999_999], copies: 1, output: "pdf" }, origin, admin)).rejects.toMatchObject({ status: 404 });
  });

  it("lists which assets have had tags printed", async () => {
    const tagged = await db.select({ id: s.assets.id }).from(s.assets).where(isNotNull(s.assets.tagPrintedAt));
    expect(tagged.map((r) => r.id).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
  });
});
