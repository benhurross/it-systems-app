import { parseArgs } from "node:util";
import { readSheet } from "read-excel-file/node";
import { db } from "@/server/db";
import { DEMO_ACCOUNTS } from "@/server/seed/demo-data";
import { seedDemo } from "@/server/seed/demo";
import { cleanPeople } from "@/server/seed/people";

// Replaces everything in the database with demo data. Development and test databases only.
// With --people <file.xlsx>, a real staff list takes the place of the invented people.
const { values } = parseArgs({ options: { people: { type: "string" } } });

let people;
if (values.people) {
  const cleaned = cleanPeople(await readSheet(values.people));
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
}
