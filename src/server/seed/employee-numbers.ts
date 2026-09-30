import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { employees } from "../db/schema";
import type { Person } from "./people";

/**
 * Sets the ID numbers of people already in the directory from a staff list, without touching
 * anything else. People are matched by email, or by name when the list has no email for them.
 * Inactive people's numbers are cleared, as the list loader drops them.
 */
export async function applyEmployeeNumbers(people: Person[]) {
  const current = await db.select({ id: employees.id, name: employees.name, email: employees.email, number: employees.employeeNumber }).from(employees);
  const byEmail = new Map(current.map((e) => [e.email.toLowerCase(), e]));
  const byName = new Map<string, typeof current>();
  for (const e of current) byName.set(e.name.toLowerCase(), [...(byName.get(e.name.toLowerCase()) ?? []), e]);

  let updated = 0;
  let unchanged = 0;
  const unmatched: string[] = [];
  for (const person of people) {
    const sameName = byName.get(person.name.toLowerCase()) ?? [];
    const match = (!person.placeholderEmail && byEmail.get(person.email.toLowerCase())) || (sameName.length === 1 ? sameName[0] : undefined);
    if (!match) {
      unmatched.push(person.name);
      continue;
    }
    if (match.number === person.employeeNumber) {
      unchanged++;
      continue;
    }
    await db.update(employees).set({ employeeNumber: person.employeeNumber, updatedAt: sql`now()` }).where(eq(employees.id, match.id));
    updated++;
  }
  return { updated, unchanged, unmatched };
}
