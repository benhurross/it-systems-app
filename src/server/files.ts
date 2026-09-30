import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// The ignore comments keep the build from treating these runtime paths as files to bundle, which
// would otherwise pull the whole project into the server output.

/** Where uploaded files are kept: UPLOADS_DIR, or an "uploads" folder beside the app. */
export const uploadsDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR || "uploads");

// Files are stored under random names in a folder per month, so an uploaded name can never choose
// where a file lands. Only keys in exactly this shape are ever read or removed.
const KEY = /^\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function located(key: string) {
  if (!KEY.test(key)) throw new Error(`Not a storage key: ${key}`);
  return path.join(/*turbopackIgnore: true*/ uploadsDir(), key);
}

/** Saves the bytes under a new random key, written whole or not at all, and returns the key. */
export async function storeFile(bytes: Uint8Array, now = new Date()): Promise<string> {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
  const target = located(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ `${target}.part`, bytes, { flag: "wx" });
  await rename(/*turbopackIgnore: true*/ `${target}.part`, target);
  return key;
}

export const readStoredFile = (key: string) => readFile(/*turbopackIgnore: true*/ located(key));

export const removeStoredFile = (key: string) => rm(/*turbopackIgnore: true*/ located(key), { force: true });
