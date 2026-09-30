import { and, count, desc, eq } from "drizzle-orm";
import { ATTACHMENT_KINDS_FOR, type AttachmentEntity, type AttachmentKind } from "@/lib/domain";
import { cleanFileName, MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, attachments, contracts, purchases } from "../db/schema";
import { badRequest, notFound, one } from "../http";
import { readStoredFile, removeStoredFile, storeFile } from "../files";

const PARENTS = { asset: assets, purchase: purchases, contract: contracts } as const;

async function parentExists(entity: AttachmentEntity, id: number) {
  const table = PARENTS[entity];
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (!row) throw notFound();
}

const listed = {
  id: attachments.id,
  entity: attachments.entity,
  entityId: attachments.entityId,
  kind: attachments.kind,
  name: attachments.name,
  contentType: attachments.contentType,
  size: attachments.size,
  uploadedByName: attachments.uploadedByName,
  createdAt: attachments.createdAt,
};

/** A record's documents, newest first. */
export async function listAttachments(entity: AttachmentEntity, entityId: number) {
  return db
    .select(listed)
    .from(attachments)
    .where(and(eq(attachments.entity, entity), eq(attachments.entityId, entityId)))
    .orderBy(desc(attachments.createdAt), desc(attachments.id));
}

/** How many documents each record of a kind has, for the paperclip counts in lists. */
export async function attachmentCounts(entity: AttachmentEntity) {
  const rows = await db
    .select({ entityId: attachments.entityId, n: count() })
    .from(attachments)
    .where(eq(attachments.entity, entity))
    .groupBy(attachments.entityId);
  return Object.fromEntries(rows.map((r) => [r.entityId, r.n])) as Record<number, number>;
}

/**
 * Stores a document for a record. The file must really be a PDF, PNG or JPEG (judged by its
 * content, not its name) and within the size limit; errors name the problem for the form to show.
 */
export async function addAttachment(
  input: { entity: AttachmentEntity; entityId: number; kind: AttachmentKind; name: string; bytes: Uint8Array },
  actor: Actor,
) {
  if (!(ATTACHMENT_KINDS_FOR[input.entity] as readonly string[]).includes(input.kind)) throw badRequest("fileKind");
  if (input.bytes.length === 0) throw badRequest("fileEmpty");
  if (input.bytes.length > MAX_UPLOAD_BYTES) throw badRequest("fileSize");
  const type = sniffType(input.bytes);
  if (!type) throw badRequest("fileType");
  await parentExists(input.entity, input.entityId);

  const storageKey = await storeFile(input.bytes);
  const name = cleanFileName(input.name, type);
  const row = one(
    await db
      .insert(attachments)
      .values({
        entity: input.entity,
        entityId: input.entityId,
        kind: input.kind,
        name,
        contentType: type,
        size: input.bytes.length,
        storageKey,
        uploadedBy: actor.id,
        uploadedByName: actor.name,
      })
      .returning(listed),
  );
  await audit(actor, "attach", input.entity, input.entityId, `Attached ${input.kind.replace(/_/g, " ")} "${name}"`);
  return row;
}

/** A document with its bytes, for download. */
export async function getAttachment(id: number) {
  const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!row) throw notFound();
  return { ...row, bytes: await readStoredFile(row.storageKey) };
}

export async function deleteAttachment(id: number, actor: Actor) {
  const row = one(await db.delete(attachments).where(eq(attachments.id, id)).returning());
  await removeStoredFile(row.storageKey);
  await audit(actor, "detach", row.entity, row.entityId, `Removed ${row.kind.replace(/_/g, " ")} "${row.name}"`);
  return { id };
}
