import { spawnSync } from "node:child_process";
import { db } from "@/server/db";
import { unscramble } from "@/lib/mojibake";

// Mends Arabic (and other non-English text) that was scrambled on its way into the database
// through a Windows command window, so "╪¼╪»╪⌐" reads "جدة" again. Every text column of every
// table is checked. On its own (npm run fix-arabic) it only shows what it would change; with
// --apply it makes a backup first, then changes it all at once. Running it again changes nothing.
const apply = process.argv.includes("--apply");
const client = db.$client;

type Column = { table: string; column: string; type: string };
const { rows: columns } = await client.query<Column>(`
  select c.relname as table, a.attname as column, format_type(a.atttypid, a.atttypmod) as type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and (a.atttypid in ('text'::regtype, 'varchar'::regtype, 'json'::regtype, 'jsonb'::regtype, 'text[]'::regtype, 'varchar[]'::regtype))
  order by c.relname, a.attnum`);

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const byTable = groupBy(columns, (c) => c.table);
type Change = { table: string; column: string; type: string; ctid: string; before: string; after: string };
const changes: Change[] = [];

/** The changes in one table, its rows locked when `lock` (inside the transaction). */
async function find(table: string, cols: Column[], lock: boolean) {
  const found: Change[] = [];
  const nonAscii = cols.map((c) => `${ident(c.column)}::text ~ '[^\\x01-\\x7f]'`).join(" or ");
  const { rows } = await client.query<Record<string, string | null>>(
    `select ctid::text as "__ctid", ${cols.map((c) => `${ident(c.column)}::text as ${ident(c.column)}`).join(", ")} from ${ident(table)} where ${nonAscii}${lock ? " for update" : ""}`,
  );
  for (const row of rows) {
    for (const c of cols) {
      const before = row[c.column];
      if (before === null) continue;
      const after = unscramble(before);
      if (after !== before) found.push({ table, column: c.column, type: c.type, ctid: row.__ctid!, before, after });
    }
  }
  return found;
}

for (const [table, cols] of byTable) changes.push(...(await find(table, cols, false)));

if (!changes.length) {
  console.log("No scrambled text found. Nothing to change.");
  await client.end();
  process.exit(0);
}

const short = (s: string) => (s.length > 70 ? `${s.slice(0, 70)}…` : s);
console.log(`Scrambled text found in ${changes.length} places:\n`);
for (const [where, list] of groupBy(changes, (c) => `${c.table}.${c.column}`)) {
  console.log(`  ${where}: ${list.length}`);
  for (const c of list.slice(0, 3)) console.log(`      ${short(c.before)}\n    → ${short(c.after)}`);
}

if (!apply) {
  console.log("\nNothing was changed. To mend it all (a backup is made first): npm run fix-arabic -- --apply");
  await client.end();
  process.exit(0);
}

console.log("\nMaking a backup first…");
if (spawnSync("npm", ["run", "backup"], { stdio: "inherit", shell: process.platform === "win32" }).status !== 0) {
  console.error("The backup failed, so nothing was changed.");
  await client.end();
  process.exit(1);
}

await client.query("begin");
try {
  let count = 0;
  for (const [table, cols] of byTable) {
    // A row's columns change in one go: a row changed moves, so its address holds only once.
    for (const [ctid, list] of groupBy(await find(table, cols, true), (c) => c.ctid)) {
      const sets = list.map((c, i) => `${ident(c.column)} = $${i + 2}::${c.type}`).join(", ");
      await client.query(`update ${ident(table)} set ${sets} where ctid = $1::tid`, [ctid, ...list.map((c) => c.after)]);
      count += list.length;
    }
  }
  await client.query("commit");
  console.log(`Mended ${count} places.`);
} catch (error) {
  await client.query("rollback");
  console.error("Something went wrong, so nothing was changed:", error);
  process.exitCode = 1;
}
await client.end();
