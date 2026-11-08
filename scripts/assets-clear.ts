import { spawnSync } from "node:child_process";
import { db } from "@/server/db";
import { assetsReport, clearAssets } from "@/server/seed/clear-assets";

// Empties the asset list, to start it again:
//   npm run assets:clear            reports what it would delete, changing nothing
//   npm run assets:clear confirm    makes a backup (npm run backup), then deletes every asset
// What only means something with its asset goes with it; tickets, changes, risks, workstation
// checks, IT forms and wall ports stay, their link to the asset cleared. Undo: npm run restore.
const confirm = process.argv.slice(2).some((a) => a === "confirm" || a === "--confirm");

const { removed, unlinked } = await assetsReport();
console.log(confirm ? "Deleting:" : "What `npm run assets:clear confirm` would delete:");
for (const [name, n] of removed) console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)}`);
console.log("\nKept, with their link to the asset cleared:");
for (const [name, n] of unlinked) console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)}`);
console.log("\nPeople, accounts, tickets, purchases, contracts, vendors, licences, lists and settings are not touched.");

if (!confirm) {
  await db.$client.end();
  console.log("\nNothing was changed. Add `confirm` to delete them; a backup is made first.");
  process.exit(0);
}

console.log("\nBacking up first…");
const backup = spawnSync("npm", ["run", "-s", "backup"], { stdio: "inherit", shell: process.platform === "win32" });
if (backup.status !== 0) {
  await db.$client.end();
  console.error("The backup did not finish, so nothing was deleted.");
  process.exit(1);
}
await clearAssets();
await db.$client.end();
console.log(`\nDeleted ${removed[0][1]} assets. To undo it, restore the backup just made: npm run restore -- latest`);
