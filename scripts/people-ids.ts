import { readSheet } from "read-excel-file/node";
import { db } from "@/server/db";
import { applyEmployeeNumbers } from "@/server/seed/employee-numbers";
import { cleanPeople } from "@/server/seed/people";

// Fills in ID numbers for people already in the directory from the staff list (npm run people:ids
// "<file.xlsx>"). Nothing else changes, so the rest of the data stays as it is.
const [file] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run people:ids "<path to .xlsx>"');
  process.exit(1);
}

const { people, notes } = cleanPeople(await readSheet(file));
const { updated, unchanged, unmatched } = await applyEmployeeNumbers(people);
console.log(`ID numbers: ${updated} set, ${unchanged} already right.`);
if (unmatched.length) console.log(`Not in the directory (${unmatched.length}): ${unmatched.join(", ")}`);
const idNotes = notes.filter((n) => /\bID\b/.test(n));
if (idNotes.length) {
  console.log(`\n${idNotes.length} notes:`);
  for (const note of idNotes) console.log(`  - ${note}`);
}
await db.$client.end();
