import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { apiTokens } from "../db/schema";
import { one } from "../http";

/**
 * Keys for other systems to read the KPIs, such as the dashboard the GM, DGM and Board look at.
 * A key is shown once, when it is made; only its hash is kept. It reads, and can be revoked.
 */

const PREFIX = "apit_";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createApiToken(name: string, actor: Actor) {
  const token = PREFIX + randomBytes(24).toString("base64url");
  const row = one(await db.insert(apiTokens).values({ name, hash: hash(token), prefix: token.slice(0, PREFIX.length + 6), createdBy: actor.name }).returning());
  await audit(actor, "create", "api_token", row.id, `Made the API key "${name}" (${row.prefix}…)`);
  return { id: row.id, name: row.name, prefix: row.prefix, token };
}

export async function listApiTokens() {
  return db
    .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdBy: apiTokens.createdBy, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt, revokedAt: apiTokens.revokedAt })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(id: number, actor: Actor) {
  const row = one(await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt))).returning());
  await audit(actor, "update", "api_token", id, `Revoked the API key "${row.name}" (${row.prefix}…)`);
  return { id };
}

/** The key a request carries as `Authorization: Bearer …`, if it is one still in use; its last use is noted. */
export async function apiTokenOf(req: Request, now = new Date()) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token?.startsWith(PREFIX)) return null;
  const [row] = await db.select().from(apiTokens).where(and(eq(apiTokens.hash, hash(token)), isNull(apiTokens.revokedAt)));
  if (!row) return null;
  // Noted at most once a minute, so a dashboard polling often does not write on every read.
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id));
  }
  return row;
}
