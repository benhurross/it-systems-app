import { db } from "./db";
import { auditLog } from "./db/schema";

/** Who acted. A person answering from an email link may have no account, so no id. */
export type Actor = { id: string | null; name: string };

/** Records who did what. Summaries name the record, never personal details beyond that. */
export async function audit(actor: Actor | null, action: string, entity: string, entityId: string | number, summary: string) {
  await db.insert(auditLog).values({
    userId: actor?.id ?? null,
    userName: actor?.name ?? "System",
    action,
    entity,
    entityId: String(entityId),
    summary,
  });
}
