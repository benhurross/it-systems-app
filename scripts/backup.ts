import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  BACKUP_NAME,
  DUMP_FILE,
  ENV_FILE,
  INFO_FILE,
  UPLOADS,
  backupName,
  backupsDir,
  backupsToRemove,
  copyFolder,
  database,
  dockerRunning,
  listBackups,
  run,
  uploadsDir,
} from "./backup-tools";

// Saves the database, the uploaded files and the settings into a new dated folder under
// BACKUP_DIR (default: "backups" in the app folder), then removes all but the newest BACKUP_KEEP
// backups (default 14). The app can keep running meanwhile. Restore with `npm run restore`.

const dir = backupsDir();
const keep = Number(process.env.BACKUP_KEEP) || 14;
mkdirSync(dir, { recursive: true });

let name = backupName();
if (existsSync(path.join(dir, name))) name = backupName(new Date(), true);
const finished = path.join(dir, name);
const working = `${finished}.partial`;

// A backup that was cut off part way (the computer turned off, say) is left as .partial: clear it.
for (const entry of readdirSync(dir)) {
  if (entry.endsWith(".partial") && BACKUP_NAME.test(entry.slice(0, -".partial".length))) rmSync(path.join(dir, entry), { recursive: true, force: true });
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

try {
  mkdirSync(working);

  const db = database();
  const dump = path.join(working, DUMP_FILE);
  if (dockerRunning()) {
    console.log("Saving the database from the Docker container…");
    await run("docker", ["compose", "exec", "-T", "postgres", "pg_dump", "-U", db.user, "-d", db.name, "-Fc"], { stdout: dump });
  } else {
    console.log("Saving the database with pg_dump…");
    await run("pg_dump", ["-Fc", `--dbname=${db.url}`, `--file=${dump}`]);
  }
  const dumpBytes = statSync(dump).size;
  if (dumpBytes === 0) throw new Error("The database backup came out empty.");

  console.log("Saving the uploaded files…");
  const previous = listBackups(dir).at(-1);
  const files = existsSync(uploadsDir())
    ? copyFolder(uploadsDir(), path.join(working, UPLOADS), previous && path.join(dir, previous, UPLOADS))
    : (mkdirSync(path.join(working, UPLOADS)), { copied: 0, linked: 0 });

  // The settings: BETTER_AUTH_SECRET in them unlocks the saved email password and keeps people signed in.
  if (existsSync(".env.local")) copyFileSync(".env.local", path.join(working, ENV_FILE));

  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout?.trim() || null;
  const info = { createdAt: new Date().toISOString(), appVersion: commit, databaseBytes: dumpBytes, files: files.copied + files.linked };
  writeFileSync(path.join(working, INFO_FILE), `${JSON.stringify(info, null, 2)}\n`);

  renameSync(working, finished);
  console.log(
    `Backup saved: ${finished}\n  database ${size(dumpBytes)}, ${info.files} uploaded files (${files.copied} new, ${files.linked} unchanged since the last backup)`,
  );

  for (const old of backupsToRemove(listBackups(dir), keep)) {
    rmSync(path.join(dir, old), { recursive: true, force: true });
    console.log(`Removed the old backup ${old} (keeping the newest ${keep}).`);
  }
} catch (error) {
  rmSync(working, { recursive: true, force: true });
  console.error(`Backup failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
