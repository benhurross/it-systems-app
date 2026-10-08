import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, linkSync, mkdirSync, openSync, closeSync, readdirSync, statSync, utimesSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";

// Shared by `npm run backup` and `npm run restore`. A backup is one folder holding the database
// (ap_it.dump), the uploaded files (uploads) and the settings file (env.local).

export const DUMP_FILE = "ap_it.dump";
export const ENV_FILE = "env.local";
export const UPLOADS = "uploads";
export const INFO_FILE = "backup.json";

/** A finished backup's folder name: ap-it-2026-10-08_1230, in this computer's time. */
export const BACKUP_NAME = /^ap-it-\d{4}-\d{2}-\d{2}_\d{4,6}$/;

export const backupsDir = () => path.resolve(process.env.BACKUP_DIR || "backups");
export const uploadsDir = () => path.resolve(process.env.UPLOADS_DIR || UPLOADS);

export function backupName(now = new Date(), seconds = false) {
  const two = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  return `ap-it-${date}_${two(now.getHours())}${two(now.getMinutes())}${seconds ? two(now.getSeconds()) : ""}`;
}

/** Finished backups in the folder, oldest first. Names sort by time, so no dates are parsed. */
export function listBackups(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && BACKUP_NAME.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** The backups to remove so only the newest `keep` remain. */
export const backupsToRemove = (names: string[], keep: number) => [...names].sort().slice(0, Math.max(0, names.length - Math.max(1, keep)));

const sameFile = (a: string, b: string) => {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.size === y.size && Math.abs(x.mtimeMs - y.mtimeMs) < 2000;
  } catch {
    return false;
  }
};

/**
 * Copies a folder of files. A file already in the previous backup, unchanged, is hard-linked to it
 * rather than copied, so each daily backup only takes the room of what is new. Uploaded files are
 * never changed after they are saved, which is what makes sharing them safe. Where links are not
 * possible (another drive, a network share) the file is copied. Returns how many files were copied
 * and linked.
 */
export function copyFolder(from: string, to: string, previous?: string, counts = { copied: 0, linked: 0 }) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    const before = previous && path.join(previous, entry.name);
    if (entry.isDirectory()) {
      copyFolder(source, target, before, counts);
      continue;
    }
    // Half-written uploads (.part) are skipped: they become real files only once complete.
    if (!entry.isFile() || entry.name.endsWith(".part")) continue;
    if (before && sameFile(source, before)) {
      try {
        linkSync(before, target);
        counts.linked++;
        continue;
      } catch {
        // Fall through to a copy.
      }
    }
    copyFileSync(source, target);
    const { atime, mtime } = statSync(source);
    utimesSync(target, atime, mtime);
    counts.copied++;
  }
  return counts;
}

/** The database the app uses, from DATABASE_URL. */
export function database() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Run this from the app folder, which holds .env.local.");
  const url = new URL(raw);
  return { url: raw, user: decodeURIComponent(url.username), name: decodeURIComponent(url.pathname.slice(1)) };
}

/**
 * Where pg_dump and pg_restore come from: the project's Docker container when it is running (its
 * tools always match its PostgreSQL version), otherwise the PostgreSQL tools on this computer.
 */
export function dockerRunning() {
  const running = spawnSync("docker", ["compose", "ps", "--status", "running", "--quiet", "postgres"], { encoding: "utf8" });
  return running.status === 0 && running.stdout.trim() !== "";
}

/** Runs a command; with `stdout` or `stdin`, that file is written or read directly, byte for byte. */
export function run(command: string, args: string[], files: { stdout?: string; stdin?: string } = {}) {
  const output = files.stdout ? openSync(files.stdout, "w") : "inherit";
  const input = files.stdin ? openSync(files.stdin, "r") : "ignore";
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: [input, output, "inherit"] });
    const close = () => {
      if (typeof output === "number") closeSync(output);
      if (typeof input === "number") closeSync(input);
    };
    child.on("error", (error) => {
      close();
      reject(new Error(`Could not run ${command}: ${error.message}`));
    });
    child.on("exit", (code) => {
      close();
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.slice(0, 4).join(" ")} … stopped with code ${code}.`));
    });
  });
}

/** Whether something is answering on the app's port, meaning the app is still running. */
export function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}
