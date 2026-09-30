import { parseArgs } from "node:util";
import { readSheet } from "read-excel-file/node";
import { db } from "@/server/db";
import { DEMO_ACCOUNTS } from "@/server/seed/demo-data";
import { seedDemo } from "@/server/seed/demo";
import { cleanPeople } from "@/server/seed/people";

// Replaces everything in the database with demo data. Development and test databases only.
// Given a staff list (npm run db:seed:demo "<file.xlsx>"), its people take the place of the invented ones.
// The file may also follow --people; PowerShell drops the `--` npm needs to pass that on, so a bare path
// is accepted too.
const { values, positionals } = parseArgs({ options: { people: { type: "string" } }, allowPositionals: true });
const file = values.people ?? positionals[0];

let people;
if (file) {
  const cleaned = cleanPeople(await readSheet(file));
  people = cleaned.people;
  console.log(`Staff list: ${people.length} people, ${cleaned.notes.length} notes (npm run people:check lists them).`);
}

const counts = await seedDemo(new Date(), { people });
await db.$client.end();
console.log(`Demo data loaded: ${counts.employees} employees, ${counts.assets} assets, ${counts.tickets} tickets.`);
if (people) {
  console.log("\nAccounts, each with a one-time password. Share them privately; each person can change theirs from the user menu:");
  for (const a of counts.accounts) console.log(`  ${a.role.padEnd(8)} ${a.email.padEnd(34)} ${a.password}   ${a.name}`);
} else {
  console.log(`Demo accounts: ${DEMO_ACCOUNTS.map((a) => a.email).join(", ")} (password in src/server/seed/demo-data.ts).`);
  console.log('These people are invented. To use your staff list instead: npm run db:seed:demo "<path to .xlsx>"');
}
