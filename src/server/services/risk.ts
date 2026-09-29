import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import type { z } from "zod";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import type { riskInput, vulnerabilityInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, risks, users, vulnerabilities } from "../db/schema";
import { one } from "../http";

export async function listRisks() {
  return db
    .select({ ...getTableColumns(risks), ownerName: users.name, assetName: assets.name })
    .from(risks)
    .leftJoin(users, eq(users.id, risks.ownerId))
    .leftJoin(assets, eq(assets.id, risks.assetId))
    .orderBy(asc(risks.id));
}

export async function createRisk(input: z.infer<typeof riskInput>, actor: Actor) {
  const row = one(await db.insert(risks).values(input).returning());
  await audit(actor, "create", "risk", row.id, `Logged ${ref("risk", row.id)}: ${row.title}`);
  return row;
}

export async function updateRisk(id: number, input: z.infer<typeof riskInput>, actor: Actor) {
  const row = one(await db.update(risks).set(input).where(eq(risks.id, id)).returning());
  await audit(actor, "update", "risk", id, `Updated ${ref("risk", id)} (${row.likelihood}x${row.impact}, ${row.status})`);
  return row;
}

export async function listVulnerabilities() {
  return db
    .select({ ...getTableColumns(vulnerabilities), ownerName: users.name, assetName: assets.name })
    .from(vulnerabilities)
    .leftJoin(users, eq(users.id, vulnerabilities.ownerId))
    .leftJoin(assets, eq(assets.id, vulnerabilities.assetId))
    .orderBy(desc(vulnerabilities.detectedOn));
}

/** Resolving stamps today's date unless one was already recorded. */
const resolvedOn = (status: string, current: string | null = null) =>
  status === "resolved" ? (current ?? isoDate()) : null;

export async function createVulnerability(input: z.infer<typeof vulnerabilityInput>, actor: Actor) {
  const row = one(await db.insert(vulnerabilities).values({ ...input, resolvedOn: resolvedOn(input.status) }).returning());
  await audit(actor, "create", "vulnerability", row.id, `Logged ${ref("vulnerability", row.id)}: ${row.title} (${row.severity})`);
  return row;
}

export async function updateVulnerability(id: number, input: z.infer<typeof vulnerabilityInput>, actor: Actor) {
  const current = one(await db.select().from(vulnerabilities).where(eq(vulnerabilities.id, id)));
  const row = one(
    await db
      .update(vulnerabilities)
      .set({ ...input, resolvedOn: resolvedOn(input.status, current.resolvedOn) })
      .where(eq(vulnerabilities.id, id))
      .returning(),
  );
  await audit(actor, "update", "vulnerability", id, `Updated ${ref("vulnerability", id)} (${row.status})`);
  return row;
}
