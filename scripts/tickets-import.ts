import { parseArgs } from "node:util";
import { inArray } from "drizzle-orm";
import readXlsxFile from "read-excel-file/node";
import { ref } from "@/lib/domain";
import { db } from "@/server/db";
import { lookups } from "@/server/db/schema";
import { cleanPeopleSheet, cleanTickets, importTickets } from "@/server/seed/tickets";

// Loads the IT ticket log:
//   npm run tickets:import "<path to .xlsx>"           reports what it would do, changing nothing
//   npm run tickets:import "<path to .xlsx>" add       adds the log's tickets to those in the app:
//       tickets the log loaded before are brought up to date, and a ticket made in the app whose
//       number the log uses moves to a new number after the last
//   npm run tickets:import "<path to .xlsx>" replace   removes every ticket and loads the log's
// ("add" and "replace" may also be given as --add and --replace; PowerShell drops the `--` npm needs to pass that on.)
// The tickets are on the first sheet. A sheet named "People", if there is one, says who names in
// the log are: people already in the directory, people to add, and IT accounts to make.
const { values, positionals } = parseArgs({ options: { replace: { type: "boolean" }, add: { type: "boolean" } }, allowPositionals: true });
const replace = values.replace === true || positionals.includes("replace");
const add = !replace && (values.add === true || positionals.includes("add"));
const file = positionals.find((p) => p !== "replace" && p !== "add");
if (!file) {
  console.error('Usage: npm run tickets:import "<path to .xlsx>" [add | replace]');
  process.exit(1);
}

const rows = await db.select().from(lookups).where(inArray(lookups.list, ["location", "issue_type", "channel", "department"]));
const list = (name: string) => rows.filter((l) => l.list === name);
const sheets = await readXlsxFile(file);
const { tickets, notes } = cleanTickets(sheets[0].data, { location: list("location"), issue_type: list("issue_type"), channel: list("channel") });
const peopleSheet = sheets.find((s) => s.sheet.trim().toLowerCase() === "people");
const people = peopleSheet ? cleanPeopleSheet(peopleSheet.data, { department: list("department"), location: list("location") }) : { fixes: [], notes: [] };
notes.push(...people.notes);
// Without add or replace, the report says what adding would do.
const report = await importTickets(tickets, { replace, add, people: people.fixes, plan: !replace });
await db.$client.end();

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "-";
const sum = (items: { tickets: number }[]) => items.reduce((n, i) => n + i.tickets, 0);
console.log(`Ticket log: ${report.tickets} tickets, ${tickets[0] ? ref("ticket", tickets[0].number) : "-"} to ${tickets.at(-1) ? ref("ticket", tickets.at(-1)!.number) : "-"}, opened ${day(report.first)} to ${day(report.last)}.`);
if (peopleSheet) console.log(`People sheet: ${people.fixes.length} rows.`);
console.log(`Requesters: ${report.exact} tickets by name, ${sum(report.close)} by the People sheet or a close name.`);
for (const c of report.close) console.log(`  "${c.from}" is ${c.to} (${c.tickets})`);
if (report.added.length) {
  const how = { current: "current", left: "has left", mailbox: "shared mailbox" } as const;
  console.log(`Added to the directory (${sum(report.added)} tickets):`);
  for (const a of report.added) {
    const source = a.kind === "listed" ? "from the People sheet" : a.kind === "team" ? "a team" : "not on the staff list";
    const from = a.from.length > 1 || (a.from[0] && a.from[0] !== a.name) ? `, from ${a.from.map((f) => `"${f}"`).join(", ")}` : "";
    console.log(`  ${a.name} (${how[a.status]}, ${source}): ${a.tickets}${from}`);
  }
}
console.log("Closed by:");
for (const c of report.closers) console.log(`  "${c.from}": ${c.to ?? "no IT account found, so left unassigned"} (${c.tickets})`);
console.log(`Received by: ${report.channels.map((c) => `${c.channel ?? "not recorded"} ${c.tickets}`).join(", ")}`);
if (report.reopened) console.log(`Reopened: ${report.reopened}`);
if (!replace) {
  const fresh = report.tickets - report.updated.length;
  console.log(`\nAdding to the ${report.existing} tickets in the app: ${fresh} new from the log, ${report.updated.length} loaded from the log before and brought up to date.`);
  if (report.moved.length) {
    console.log(`Tickets made in the app whose numbers the log uses move to new numbers (their comments, emails and history go with them):`);
    for (const m of report.moved) console.log(`  ${ref("ticket", m.from)} is now ${ref("ticket", m.to)}`);
  } else console.log("No ticket made in the app uses one of the log's numbers.");
}
if (notes.length) {
  console.log(`\n${notes.length} notes:`);
  for (const note of notes) console.log(`  - ${note}`);
}
if (report.accounts.length) {
  console.log("\nNew accounts, each with a one-time password. Share them privately; each person can change theirs from the user menu:");
  for (const a of report.accounts) console.log(`  ${a.role.padEnd(8)} ${a.email.padEnd(34)} ${a.password}   ${a.name}`);
}
const after = Math.max(tickets.at(-1)?.number ?? 0, ...report.moved.map((m) => m.to));
console.log(
  replace
    ? `\nDone: removed ${report.existing} tickets and loaded ${report.tickets}. New tickets continue from ${ref("ticket", (tickets.at(-1)?.number ?? 0) + 1)}.`
    : add
      ? `\nDone: the log's ${report.tickets} tickets are in, and ${report.moved.length} made in the app moved. New tickets continue from ${ref("ticket", after + 1)} or later.`
      : `\nNothing changed. To add these to the tickets in the app: npm run tickets:import "${file}" add\n(Or, to remove the ${report.existing} tickets now in the database and load only these: npm run tickets:import "${file}" replace)`,
);
process.exit(0);
