import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import type { licenseInput, licenseInstall } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, employees, licenseInstalls, licenses, vendors } from "../db/schema";
import { one } from "../http";

const installs = sql<number>`(select count(*) from ${licenseInstalls} where ${licenseInstalls.licenseId} = ${licenses.id})`.mapWith(
  Number,
);

const withCounts = () =>
  db
    .select({ ...getTableColumns(licenses), vendorName: vendors.name, installs })
    .from(licenses)
    .leftJoin(vendors, eq(vendors.id, licenses.vendorId));

export async function listLicenses() {
  return withCounts().orderBy(asc(licenses.product));
}

/** One licence and the devices it is installed on. */
export async function getLicense(id: number) {
  const license = one(await withCounts().where(eq(licenses.id, id)));
  const devices = await db
    .select({
      id: licenseInstalls.id,
      assetId: assets.id,
      name: assets.name,
      category: assets.category,
      assignedName: employees.name,
    })
    .from(licenseInstalls)
    .innerJoin(assets, eq(assets.id, licenseInstalls.assetId))
    .leftJoin(employees, eq(employees.id, assets.assignedTo))
    .where(eq(licenseInstalls.licenseId, id))
    .orderBy(asc(assets.name));
  return { ...license, devices };
}

export async function createLicense(input: z.infer<typeof licenseInput>, actor: Actor) {
  const row = one(await db.insert(licenses).values(input).returning());
  await audit(actor, "create", "license", row.id, `Registered ${ref("license", row.id)}: ${row.product}`);
  return row;
}

export async function updateLicense(id: number, input: z.infer<typeof licenseInput>, actor: Actor) {
  const row = one(await db.update(licenses).set(input).where(eq(licenses.id, id)).returning());
  await audit(actor, "update", "license", id, `Updated ${ref("license", id)}: ${row.product}`);
  return row;
}

export async function addInstall(id: number, input: z.infer<typeof licenseInstall>, actor: Actor) {
  const row = one(await db.insert(licenseInstalls).values({ licenseId: id, assetId: input.assetId }).returning());
  await audit(actor, "install", "license", id, `Installed ${ref("license", id)} on ${ref("asset", input.assetId)}`);
  return row;
}

export async function removeInstall(id: number, assetId: number, actor: Actor) {
  const row = one(
    await db
      .delete(licenseInstalls)
      .where(and(eq(licenseInstalls.licenseId, id), eq(licenseInstalls.assetId, assetId)))
      .returning(),
  );
  await audit(actor, "uninstall", "license", id, `Removed ${ref("license", id)} from ${ref("asset", assetId)}`);
  return row;
}
