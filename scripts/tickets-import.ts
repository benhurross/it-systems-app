import { parseArgs } from "node:util";
import { inArray } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { ref } from "@/lib/domain";
import { db } from "@/server/db";
import { lookups } from "@/server/db/schema";
import { cleanTickets, importTickets } from "@/server/seed/tickets";

// Loads the IT ticket log in place of the tickets in the database:
//   npm run tickets:import "<path to .xlsx>"           reports what it would do, changing nothing
//   npm run tickets:import "<path to .xlsx>" replace   removes every ticket and loads the log's
// ("replace" may also be given as --replace; PowerShell drops the `--` npm needs to pass that on.)
const { values, positionals } = parseArgs({ options: { replace: { type: "boolean" } }, allowPositionals: true });
const replace = values.replace === true || positionals.includes("replace");
const file = positionals.find((p) => p !== "replace");
if (!file) {
  console.error('Usage: npm run tickets:import "<path to .xlsx>" [replace]');
  process.exit(1);
}

const lists = await db.select().from(lookups).where(inArray(lookups.list, ["location", "issue_type"]));
const { tickets, notes } = cleanTickets(await readSheet(file), {
  location: lists.filter((l) => l.list === "location"),
  issue_type: lists.filter((l) => l.list === "issue_type"),
});
const report = await importTickets(tickets, { replace });
await db.$client.end();

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "-";
console.log(`Ticket log: ${report.tickets} tickets, ${tickets[0] ? ref("ticket", tickets[0].number) : "-"} to ${tickets.at(-1) ? ref("ticket", tickets.at(-1)!.number) : "-"}, opened ${day(report.first)} to ${day(report.last)}.`);
console.log(`Requesters: ${report.exact} tickets by name, ${report.close.reduce((n, c) => n + c.tickets, 0)} by a close name.`);
for (const c of report.close) console.log(`  "${c.from}" is ${c.to} (${c.tickets})`);
if (report.added.length) {
  console.log(`Not in the directory, so added to it (${report.added.reduce((n, a) => n + a.tickets, 0)} tickets):`);
  for (const a of report.added) console.log(`  ${a.name}${a.team ? " (shared mailbox)" : " (not on the staff list, added as left)"}: ${a.tickets}${a.from.length > 1 || a.from[0] !== a.name ? `, from ${a.from.map((f) => `"${f}"`).join(", ")}` : ""}`);
}
console.log("Closed by:");
for (const c of report.closers) console.log(`  "${c.from}": ${c.to ?? "no IT account found, so left unassigned"} (${c.tickets})`);
console.log(`Received by: ${report.channels.map((c) => `${c.channel ?? "not recorded"} ${c.tickets}`).join(", ")}`);
if (notes.length) {
  console.log(`\n${notes.length} notes:`);
  for (const note of notes) console.log(`  - ${note}`);
}
console.log(
  replace
    ? `\nDone: removed ${report.existing} tickets and loaded ${report.tickets}. New tickets continue from ${ref("ticket", (tickets.at(-1)?.number ?? 0) + 1)}.`
    : `\nNothing changed. To remove the ${report.existing} tickets now in the database and load these: npm run tickets:import "${file}" replace`,
);
process.exit(0);
