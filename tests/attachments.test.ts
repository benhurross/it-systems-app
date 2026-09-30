import { existsSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanFileName, MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.UPLOADS_DIR = await mkdtemp(path.join(tmpdir(), "ap-it-uploads-"));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const files = await import("@/server/services/attachments");

const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

let it_: Awaited<ReturnType<typeof asUser>>;
let assetId: number;
beforeAll(async () => {
  await seedDemo(NOW);
  it_ = await asUser("it@applus.test");
  [{ id: assetId }] = await db.select({ id: s.assets.id }).from(s.assets).limit(1);
}, 120_000);

describe("file checks", () => {
  it("tells PDFs and images by their content, whatever they are called", () => {
    expect(sniffType(PDF)).toBe("application/pdf");
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(JPEG)).toBe("image/jpeg");
    expect(sniffType(HTML)).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });

  it("keeps a safe name ending in the right extension", () => {
    expect(cleanFileName("Invoice 2026-001.pdf", "application/pdf")).toBe("Invoice 2026-001.pdf");
    expect(cleanFileName("C:\\Users\\x\\scan.JPG", "image/jpeg")).toBe("scan.jpg");
    expect(cleanFileName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
    expect(cleanFileName('report"<x>.exe', "application/pdf")).toBe("reportx.pdf");
    expect(cleanFileName("", "image/png")).toBe("file.png");
  });
});

describe("attachments", () => {
  it("stores a document under a random name and lists it on its record", async () => {
    const row = await files.addAttachment({ entity: "asset", entityId: assetId, kind: "invoice", name: "Dell invoice.pdf", bytes: PDF }, it_);
    expect(row).toMatchObject({ entity: "asset", entityId: assetId, kind: "invoice", name: "Dell invoice.pdf", contentType: "application/pdf", size: PDF.length });
    expect(await files.listAttachments("asset", assetId)).toEqual([row]);
    expect((await files.attachmentCounts("asset"))[assetId]).toBe(1);

    const stored = await files.getAttachment(row.id);
    expect(new Uint8Array(stored.bytes)).toEqual(PDF);
    expect(stored.storageKey).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}$/);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, stored.storageKey))).toBe(true);

    const [entry] = await db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(1);
    expect(entry).toMatchObject({ entity: "asset", entityId: String(assetId), summary: 'Attached invoice "Dell invoice.pdf"' });
  });

  it("refuses anything that is not a PDF or image, empty, too big, of the wrong kind, or for no record", async () => {
    const add = (over: Partial<Parameters<typeof files.addAttachment>[0]>) =>
      files.addAttachment({ entity: "asset", entityId: assetId, kind: "invoice", name: "x.pdf", bytes: PDF, ...over }, it_);
    await expect(add({ bytes: HTML, name: "invoice.pdf" })).rejects.toMatchObject({ status: 400, message: "fileType" });
    await expect(add({ bytes: new Uint8Array() })).rejects.toMatchObject({ status: 400, message: "fileEmpty" });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(PDF);
    await expect(add({ bytes: big })).rejects.toMatchObject({ status: 400, message: "fileSize" });
    await expect(add({ kind: "renewal_quote" })).rejects.toMatchObject({ status: 400, message: "fileKind" });
    await expect(add({ entityId: 999_999 })).rejects.toMatchObject({ status: 404 });
  });

  it("removes the file from disk when a document is deleted", async () => {
    const row = await files.addAttachment({ entity: "asset", entityId: assetId, kind: "photo", name: "front.png", bytes: PNG }, it_);
    const { storageKey } = await files.getAttachment(row.id);
    await files.deleteAttachment(row.id, it_);
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, storageKey))).toBe(false);
    expect(await db.select().from(s.attachments).where(eq(s.attachments.id, row.id))).toEqual([]);
    await expect(files.getAttachment(row.id)).rejects.toMatchObject({ status: 404 });
  });

  it("never leaves half-written files behind", async () => {
    const months = await readdir(process.env.UPLOADS_DIR!);
    const all = (await Promise.all(months.map((m) => readdir(path.join(process.env.UPLOADS_DIR!, m))))).flat();
    expect(all.filter((f) => f.endsWith(".part"))).toEqual([]);
  });
});
