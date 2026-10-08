import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { DUMP_FILE, ENV_FILE, INFO_FILE, UPLOADS, backupName, backupsDir, copyFolder, database, dockerRunning, listBackups, portInUse, run, uploadsDir } from "./backup-tools";

// Puts a backup from `npm run backup` back: the database is replaced by the backup's, then brought
// up to this version of the app, and the uploads folder is replaced by the backup's (the current
// one is kept beside it, renamed). Usage:
//   npm run restore -- latest                  the newest backup in BACKUP_DIR
//   npm run restore -- "D:\AP-IT-Backups\ap-it-2026-10-08_1230"
// Add --yes to skip the question before anything is replaced.

const args = process.argv.slice(2);
const choice = args.find((a) => a !== "--yes");
if (!choice) {
  console.error('Usage: npm run restore -- latest   or   npm run restore -- "<backup folder>"');
  process.exit(1);
}
const newest = listBackups(backupsDir()).at(-1);
const folder = choice === "latest" ? newest && path.join(backupsDir(), newest) : path.resolve(choice);
if (!folder || !existsSync(path.join(folder, DUMP_FILE))) {
  console.error(choice === "latest" ? `No backups found in ${backupsDir()}.` : `${folder} is not a backup: it has no ${DUMP_FILE}.`);
  process.exit(1);
}

if (await portInUse(3200)) {
  console.error("The app is still running (port 3200 is in use). Stop it first, then run the restore again.");
  process.exit(1);
}

// The settings. On a new computer, the backup's are taken as they are; elsewhere they are kept,
// with a warning when the secret differs, since the secret unlocks what the backup holds.
const savedEnv = path.join(folder, ENV_FILE);
if (!existsSync(".env.local") && existsSync(savedEnv)) {
  copyFileSync(savedEnv, ".env.local");
  process.loadEnvFile(".env.local");
  console.log("Copied the backup's settings to .env.local. Check BETTER_AUTH_URL there if this computer's address is different.");
} else if (existsSync(savedEnv)) {
  const saved = parseEnv(readFileSync(savedEnv, "utf8")).BETTER_AUTH_SECRET;
  if (saved && saved !== process.env.BETTER_AUTH_SECRET) {
    console.warn(
      "Note: BETTER_AUTH_SECRET in .env.local differs from the backup's. Everyone will need to sign in again, and the email password in Settings → Email must be entered again. To avoid that, copy BETTER_AUTH_SECRET from env.local in the backup into .env.local first.",
    );
  }
}

const db = database();
const target = uploadsDir();
const info = existsSync(path.join(folder, INFO_FILE)) ? (JSON.parse(readFileSync(path.join(folder, INFO_FILE), "utf8")) as { createdAt?: string }) : {};
const when = info.createdAt ? new Date(info.createdAt).toLocaleString() : path.basename(folder);

if (!args.includes("--yes")) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(
    `This replaces everything in the database "${db.name}" and the files in ${target}\nwith the backup from ${when}. Type yes to go on: `,
  );
  prompt.close();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Nothing was changed.");
    process.exit(0);
  }
}

try {
  console.log("Emptying the database…");
  const maintenance = new URL(db.url);
  maintenance.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: maintenance.href });
  await admin.connect();
  const quoted = `"${db.name.replaceAll('"', '""')}"`;
  await admin.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${quoted}`);
  await admin.end();

  console.log("Loading the backup into the database…");
  const dump = path.join(folder, DUMP_FILE);
  const options = ["--no-owner", "--no-privileges", "--exit-on-error"];
  if (dockerRunning()) await run("docker", ["compose", "exec", "-T", "postgres", "pg_restore", "-U", db.user, "-d", db.name, ...options], { stdin: dump });
  else await run("pg_restore", [...options, `--dbname=${db.url}`, dump]);

  // A backup from an older version of the app gets the changes made since.
  const migrated = drizzle(db.url);
  await migrate(migrated, { migrationsFolder: "drizzle" });
  await migrated.$client.end();

  console.log("Putting back the uploaded files…");
  if (existsSync(target) && readdirSync(target).length > 0) {
    const aside = `${target}-before-restore-${backupName().slice("ap-it-".length)}`;
    renameSync(target, aside);
    console.log(`  The files that were there are kept in ${aside}. Delete that folder once all is well.`);
  }
  const saved = path.join(folder, UPLOADS);
  const files = existsSync(saved) ? copyFolder(saved, target) : { copied: 0 };
  console.log(`Restored the backup from ${when}: database and ${files.copied} files. Start the app again.`);
} catch (error) {
  console.error(`Restore failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
