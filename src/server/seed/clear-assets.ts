import { count, eq, isNotNull, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  alerts,
  assetMovements,
  assets,
  attachments,
  changes,
  deviceSightings,
  floorPlans,
  itForms,
  licenseInstalls,
  monitorChecks,
  networkOutlets,
  relationships,
  risks,
  tickets,
  vulnerabilities,
  workstationChecks,
} from "../db/schema";
import { removeStoredFile } from "../files";

/**
 * Emptying the asset list to start it again. What only means something with its asset goes with it
 * (movements, CMDB links, software installs, monitoring, attached documents); what stands on its own
 * stays, its link to the asset cleared (tickets, changes, risks, workstation checks, IT forms, wall
 * ports, PCs seen at sign-in, the floor plans' switches).
 */

const GOES: [string, PgTable][] = [
  ["asset movements", assetMovements],
  ["CMDB relationships", relationships],
  ["software installs", licenseInstalls],
  ["monitoring checks", monitorChecks],
  ["alerts", alerts],
];

const UNLINKED: [string, PgTable, AnyPgColumn][] = [
  ["tickets", tickets, tickets.assetId],
  ["changes", changes, changes.assetId],
  ["risks", risks, risks.assetId],
  ["vulnerabilities", vulnerabilities, vulnerabilities.assetId],
  ["workstation checks", workstationChecks, workstationChecks.assetId],
  ["IT forms", itForms, itForms.assetId],
  ["wall ports", networkOutlets, networkOutlets.assetId],
  ["PCs seen at sign-in", deviceSightings, deviceSightings.assetId],
];

const total = async (table: PgTable, where?: ReturnType<typeof eq>) => (await db.select({ n: count() }).from(table).where(where))[0].n;

/** How many of each would go, and how many records would lose their link to an asset. */
export async function assetsReport() {
  const removed: [string, number][] = [["assets", await total(assets)], ...(await Promise.all(GOES.map(async ([name, t]) => [name, await total(t)] as [string, number])))];
  removed.push(["attached documents", await total(attachments, eq(attachments.entity, "asset"))]);
  const unlinked = await Promise.all(UNLINKED.map(async ([name, t, col]) => [name, await total(t, isNotNull(col))] as [string, number]));
  const plans = (await db.select({ switches: floorPlans.switches }).from(floorPlans)).filter((p) => Object.keys(p.switches).length).length;
  unlinked.push(["floor plans' switches", plans]);
  return { removed, unlinked };
}

/** Deletes every asset in one go (all or nothing), then the files of their documents. */
export async function clearAssets() {
  const report = await assetsReport();
  const files = await db.transaction(async (tx) => {
    const detached = await tx.delete(attachments).where(eq(attachments.entity, "asset")).returning({ key: attachments.storageKey });
    // Which asset each switch on a floor plan is: a map the database does not follow.
    await tx.update(floorPlans).set({ switches: sql`'{}'::jsonb` });
    // The links that stay are cleared, and what hangs off an asset goes, by the database's own rules.
    await tx.delete(assets);
    return detached.map((d) => d.key);
  });
  for (const key of files) await removeStoredFile(key);
  return report;
}
