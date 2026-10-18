import { spawnSync } from "node:child_process";
import { db } from "@/server/db";
import { clearInvented, inventedReport } from "@/server/seed/clear-invented";

// Takes the made-up records out of a database loaded with the demo data and the real staff list:
//   npm run demo:clear            reports what it would remove, changing nothing
//   npm run demo:clear confirm    makes a backup (npm run backup), then removes them
// ("confirm" may also be given as --confirm; PowerShell drops the `--` npm needs to pass that on.)
// People, accounts, tickets, ID cards, joiners and leavers, the knowledge base and the dropdown
// lists stay, and so does every record someone added in the app.
const args = process.argv.slice(2);
const confirm = args.includes("confirm") || args.includes("--confirm");

const report = await inventedReport();
console.log(confirm ? "Removing the made-up records:" : "What `npm run demo:clear confirm` would remove:");
for (const r of report) {
  const kept = r.kept ? `, keeping ${r.kept} added in the app` : "";
  console.log(`  ${r.name.padEnd(18)} ${String(r.total - r.kept).padStart(5)} of ${r.total}${kept}`);
}
console.log("Kept: people, accounts, tickets, ID cards, joiners and leavers, the knowledge base, the dropdown lists and settings.");

if (!confirm) {
  await db.$client.end();
  console.log("\nNothing was changed. Add `confirm` to remove them; a backup is made first.");
  process.exit(0);
}

console.log("\nBacking up first…");
const backup = spawnSync("npm", ["run", "-s", "backup"], { stdio: "inherit", shell: process.platform === "win32" });
if (backup.status !== 0) {
  await db.$client.end();
  console.error("The backup did not finish, so nothing was removed.");
  process.exit(1);
}
const { removed, files } = await clearInvented();
await db.$client.end();
const total = Object.values(removed).reduce((a, b) => a + b, 0);
console.log(`\nRemoved ${total} records${files ? ` and ${files} attached documents` : ""}. To undo it, restore the backup just made (npm run restore).`);
