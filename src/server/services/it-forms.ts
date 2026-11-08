import { and, desc, eq, type SQL } from "drizzle-orm";
import { IT_FORM_KINDS, type ItFormInput, type ItFormKind } from "@/lib/it-forms";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets, employees, itForms } from "../db/schema";
import { badRequest, one } from "../http";

/** IT's paper forms as filled in the app, kept to print again. */

const NAMES: Record<ItFormKind, string> = {
  incident_repair: "IT incident / repair form",
  it_request: "IT services & ERP request form",
  credentials: "employee credential information",
  maintenance: "scheduled maintenance report",
};

const listed = {
  id: itForms.id,
  kind: itForms.kind,
  employeeId: itForms.employeeId,
  employeeName: itForms.employeeName,
  assetId: itForms.assetId,
  createdByName: itForms.createdByName,
  createdAt: itForms.createdAt,
  updatedAt: itForms.updatedAt,
};

/** Every form, newest first, or one person's, or one kind. */
export async function listItForms(filter: { employeeId?: number; kind?: ItFormKind } = {}) {
  const where: SQL[] = [];
  if (filter.employeeId) where.push(eq(itForms.employeeId, filter.employeeId));
  if (filter.kind) where.push(eq(itForms.kind, filter.kind));
  return db
    .select(listed)
    .from(itForms)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(itForms.createdAt), desc(itForms.id));
}

export async function getItForm(id: number) {
  return one(await db.select({ ...listed, data: itForms.data }).from(itForms).where(eq(itForms.id, id)));
}

async function linksExist(input: ItFormInput) {
  if (input.employeeId) one(await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)));
  if (input.assetId) one(await db.select({ id: assets.id }).from(assets).where(eq(assets.id, input.assetId)));
}

const values = (input: ItFormInput) => ({
  kind: input.kind,
  employeeId: input.employeeId ?? null,
  employeeName: input.data.person.name,
  assetId: input.assetId ?? null,
  data: input.data as Record<string, unknown>,
});

export async function createItForm(input: ItFormInput, actor: Actor) {
  await linksExist(input).catch(() => {
    throw badRequest("A linked record does not exist");
  });
  const row = one(await db.insert(itForms).values({ ...values(input), createdBy: actor.id, createdByName: actor.name }).returning({ id: itForms.id }));
  await audit(actor, "create", "it_form", row.id, `Filled in the ${NAMES[input.kind]}${input.data.person.name ? ` for ${input.data.person.name}` : ""}`);
  return row;
}

/** A correction: the form stays the kind it was. */
export async function updateItForm(id: number, input: ItFormInput, actor: Actor) {
  const current = await getItForm(id);
  if (current.kind !== input.kind) throw badRequest("A form stays the kind it was");
  await linksExist(input).catch(() => {
    throw badRequest("A linked record does not exist");
  });
  await db.update(itForms).set({ ...values(input), updatedAt: new Date() }).where(eq(itForms.id, id));
  await audit(actor, "update", "it_form", id, `Corrected the ${NAMES[input.kind]}${input.data.person.name ? ` for ${input.data.person.name}` : ""}`);
  return { id };
}

export async function deleteItForm(id: number, actor: Actor) {
  const row = one(await db.delete(itForms).where(eq(itForms.id, id)).returning());
  await audit(actor, "delete", "it_form", id, `Deleted the ${NAMES[row.kind]}${row.employeeName ? ` for ${row.employeeName}` : ""}`);
  return { id };
}

/**
 * What a new form of a kind starts with besides the employee's details: on the credential sheet,
 * the links and the signer last written, so IT does not type them each time.
 */
export async function itFormStart(kind: ItFormKind) {
  if (!IT_FORM_KINDS.includes(kind) || kind !== "credentials") return {};
  const [last] = await db.select({ data: itForms.data }).from(itForms).where(eq(itForms.kind, "credentials")).orderBy(desc(itForms.createdAt)).limit(1);
  const data = (last?.data ?? {}) as { outlookUrl?: string; ticketingUrl?: string; signedBy?: string };
  return { outlookUrl: data.outlookUrl ?? "", ticketingUrl: data.ticketingUrl ?? "", signedBy: data.signedBy ?? "" };
}
