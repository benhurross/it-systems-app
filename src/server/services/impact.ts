import { and, count, eq, or, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  alerts,
  assetMovements,
  assets,
  attachments,
  changes,
  contracts,
  deviceSightings,
  floorPlans,
  itForms,
  kpiFigures,
  kpis,
  kpiYears,
  licenseInstalls,
  licenses,
  monitorChecks,
  networkOutlets,
  projects,
  projectTasks,
  purchases,
  relationships,
  risks,
  teamTasks,
  tickets,
  vendors,
  vulnerabilities,
  workstationChecks,
} from "../db/schema";
import { notFound } from "../http";

/**
 * What deleting a record would take with it, and what would only lose its link to it, counted
 * now, for the "Are you sure?" before a delete. Only what is there is listed.
 */

export const IMPACT_KINDS = ["asset", "project", "vendor", "purchase", "contract", "floor_plan", "kpi"] as const;
export type ImpactKind = (typeof IMPACT_KINDS)[number];
/** Each line: what it is (worded by the page), and how many. */
export type Impact = { goes: { what: string; count: number }[]; unlinked: { what: string; count: number }[] };

const many = async (table: PgTable, where: SQL | undefined) => (await db.select({ n: count() }).from(table).where(where))[0].n;
const documents = (entity: "asset" | "purchase" | "contract", id: number) => and(eq(attachments.entity, entity), eq(attachments.entityId, id));

/** The record itself, to say it is not there (another person deleted it, say). */
const EXISTS: Record<ImpactKind, [PgTable, (id: number) => SQL]> = {
  asset: [assets, (id) => eq(assets.id, id)],
  project: [projects, (id) => eq(projects.id, id)],
  vendor: [vendors, (id) => eq(vendors.id, id)],
  purchase: [purchases, (id) => eq(purchases.id, id)],
  contract: [contracts, (id) => eq(contracts.id, id)],
  floor_plan: [floorPlans, (id) => eq(floorPlans.id, id)],
  kpi: [kpis, (id) => eq(kpis.id, id)],
};

/** For each kind: [what, table, which rows] deleted with it, and those only unlinked. */
const LINKS: Record<ImpactKind, { goes: [string, PgTable, (id: number) => SQL | undefined][]; unlinked: [string, PgTable, (id: number) => SQL | undefined][] }> = {
  asset: {
    goes: [
      ["movements", assetMovements, (id) => eq(assetMovements.assetId, id)],
      ["cmdbLinks", relationships, (id) => or(eq(relationships.sourceId, id), eq(relationships.targetId, id))],
      ["softwareInstalls", licenseInstalls, (id) => eq(licenseInstalls.assetId, id)],
      ["monitorChecks", monitorChecks, (id) => eq(monitorChecks.assetId, id)],
      ["alerts", alerts, (id) => eq(alerts.assetId, id)],
      ["documents", attachments, (id) => documents("asset", id)],
    ],
    unlinked: [
      ["tickets", tickets, (id) => eq(tickets.assetId, id)],
      ["changes", changes, (id) => eq(changes.assetId, id)],
      ["risks", risks, (id) => eq(risks.assetId, id)],
      ["vulnerabilities", vulnerabilities, (id) => eq(vulnerabilities.assetId, id)],
      ["workstationChecks", workstationChecks, (id) => eq(workstationChecks.assetId, id)],
      ["itForms", itForms, (id) => eq(itForms.assetId, id)],
      ["outlets", networkOutlets, (id) => eq(networkOutlets.assetId, id)],
      ["devicesSeen", deviceSightings, (id) => eq(deviceSightings.assetId, id)],
    ],
  },
  project: {
    goes: [["projectTasks", projectTasks, (id) => eq(projectTasks.projectId, id)]],
    unlinked: [["teamTasks", teamTasks, (id) => eq(teamTasks.projectId, id)]],
  },
  vendor: {
    goes: [],
    unlinked: [
      ["licenses", licenses, (id) => eq(licenses.vendorId, id)],
      ["contracts", contracts, (id) => eq(contracts.vendorId, id)],
      ["purchases", purchases, (id) => eq(purchases.vendorId, id)],
    ],
  },
  purchase: {
    goes: [["documents", attachments, (id) => documents("purchase", id)]],
    unlinked: [["assets", assets, (id) => eq(assets.purchaseId, id)]],
  },
  contract: {
    goes: [["documents", attachments, (id) => documents("contract", id)]],
    unlinked: [],
  },
  floor_plan: {
    goes: [["outlets", networkOutlets, (id) => eq(networkOutlets.planId, id)]],
    unlinked: [["placedAssets", assets, (id) => eq(assets.planId, id)]],
  },
  kpi: {
    goes: [
      ["kpiYears", kpiYears, (id) => eq(kpiYears.kpiId, id)],
      ["kpiFigures", kpiFigures, (id) => eq(kpiFigures.kpiId, id)],
    ],
    unlinked: [],
  },
};

export async function deleteImpact(kind: ImpactKind, id: number): Promise<Impact> {
  const [table, where] = EXISTS[kind];
  if ((await many(table, where(id))) === 0) throw notFound();
  const counted = async (lines: (typeof LINKS)[ImpactKind]["goes"]) =>
    (await Promise.all(lines.map(async ([what, t, w]) => ({ what, count: await many(t, w(id)) })))).filter((l) => l.count > 0);
  return { goes: await counted(LINKS[kind].goes), unlinked: await counted(LINKS[kind].unlinked) };
}
