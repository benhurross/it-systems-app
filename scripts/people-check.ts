import { readSheet } from "read-excel-file/node";
import { cleanPeople } from "@/server/seed/people";
import { REFERENCE } from "@/server/seed/reference";

// Reads a staff list and reports how it would be loaded. Nothing is written to the database.
const [file] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run people:check -- "<path to .xlsx>"');
  process.exit(1);
}

const { people, notes } = cleanPeople(await readSheet(file));
const label = (list: "department" | "location", code: string) => REFERENCE[list].find(([c]) => c === code)?.[1] ?? code;
const tally = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .map(([value, n]) => `${value} ${n}`)
    .join(", ");
};

const active = people.filter((p) => p.active);
console.log(`${people.length} people: ${active.length} active, ${people.length - active.length} inactive.`);
console.log(`Departments: ${tally(people.map((p) => label("department", p.department)))}`);
console.log(`Locations: ${tally(people.map((p) => label("location", p.location)))}`);
console.log(`Placeholder emails: ${people.filter((p) => p.placeholderEmail).length}`);
console.log("Accounts:");
for (const p of people.filter((p) => p.role)) console.log(`  ${p.role}: ${p.name} <${p.email}>`);
if (notes.length) {
  console.log(`\n${notes.length} notes:`);
  for (const note of notes) console.log(`  - ${note}`);
}
process.exit(0);
