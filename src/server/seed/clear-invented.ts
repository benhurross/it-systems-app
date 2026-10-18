import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  assets,
  attachments,
  auditLog,
  budgets,
  changes,
  contracts,
  discoveryRuns,
  licenses,
  projects,
  purchases,
  risks,
  vendors,
  vulnerabilities,
} from "../db/schema";
import { removeStoredFile } from "../files";

/**
 * Taking out what the demo data made up, for a database that was loaded with it and the real staff
 * list, and is now to hold the real inventory. People, accounts, tickets (and their comments and
 * emails), ID cards, joiners and leavers, the knowledge base and the dropdown lists stay.
 *
 * A record someone added in the app is kept: the audit log has who created it. What hangs off a
 * record goes with it (an asset's movements, CMDB links, installs and monitoring; a project's tasks;
 * documents attached), and links to it from what stays are cleared (a ticket's device).
 */

type Invented = { name: string; table: PgTable & { id: AnyPgColumn }; entity: string };

/** In order of the report; the database's own links make the order of removal not matter. */
export const INVENTED: Invented[] = [
  { name: "assets", table: assets, entity: "asset" },
  { name: "software licences", table: licenses, entity: "license" },
  { name: "vendors", table: vendors, entity: "vendor" },
  { name: "contracts", table: contracts, entity: "contract" },
  { name: "purchases", table: purchases, entity: "purchase" },
  { name: "projects", table: projects, entity: "project" },
  { name: "risks", table: risks, entity: "risk" },
  { name: "vulnerabilities", table: vulnerabilities, entity: "vulnerability" },
  { name: "changes", table: changes, entity: "change" },
  { name: "network scans", table: discoveryRuns, entity: "discovery" },
];

/** The records of a kind that someone made in the app (or scanned, for network scans). */
async function madeInApp(entity: string, conn: Pick<typeof db, "selectDistinct"> = db) {
  const action = entity === "discovery" ? "scan" : "create";
  const rows = await conn
    .selectDistinct({ id: auditLog.entityId })
    .from(auditLog)
    .where(and(eq(auditLog.entity, entity), eq(auditLog.action, action)));
  return rows.map((r) => Number(r.id)).filter(Number.isInteger);
}

export type InventedReport = { name: string; total: number; kept: number }[];

/** How many of each there are, and how many of those were added in the app and would stay. */
export async function inventedReport(): Promise<InventedReport> {
  const report: InventedReport = [];
  for (const { name, table, entity } of INVENTED) {
    const ids = (await db.select({ id: table.id }).from(table)).map((r) => r.id as number);
    const kept = new Set(await madeInApp(entity));
    report.push({ name, total: ids.length, kept: ids.filter((id) => kept.has(id)).length });
  }
  report.push({ name: "budget lines", total: await db.$count(budgets), kept: 0 });
  return report;
}

/** Removes the made-up records, keeping those added in the app; says how many went of each. */
export async function clearInvented() {
  const removed: Record<string, number> = {};
  const files: string[] = [];
  await db.transaction(async (tx) => {
    for (const { name, table, entity } of INVENTED) {
      const kept = await madeInApp(entity, tx);
      const gone = await tx
        .delete(table)
        .where(kept.length ? notInArray(table.id, kept) : undefined)
        .returning({ id: table.id });
      removed[name] = gone.length;
      // Documents are attached by kind and number, not by a link the database follows.
      if (["asset", "purchase", "contract"].includes(entity) && gone.length) {
        const ids = gone.map((g) => g.id as number);
        for (let i = 0; i < ids.length; i += 1000) {
          const detached = await tx
            .delete(attachments)
            .where(and(eq(attachments.entity, entity as "asset"), inArray(attachments.entityId, ids.slice(i, i + 1000))))
            .returning({ key: attachments.storageKey });
          files.push(...detached.map((d) => d.key));
        }
      }
    }
    removed["budget lines"] = (await tx.delete(budgets).returning({ id: budgets.id })).length;
  });
  // The files go once the records are gone for good.
  for (const key of files) await removeStoredFile(key);
  return { removed, files: files.length };
}
