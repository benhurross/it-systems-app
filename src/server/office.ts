import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// LibreOffice turns PowerPoint files into PDFs: for the slide pictures in the library, and for a
// presentation downloaded as a PDF. It runs as its own program, one file at a time, with a
// settings folder of its own, so it never clashes with LibreOffice open on the same computer.

const CANDIDATES = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/opt/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

/** Where LibreOffice is: SOFFICE_PATH, or where it installs itself; null when it is not there. */
export function officePath() {
  const set = process.env.SOFFICE_PATH;
  if (set) return existsSync(set) ? set : null;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const TIMEOUT_MS = 180_000;
let queue: Promise<unknown> = Promise.resolve();

/**
 * The PDF of a PowerPoint file. Throws `officeMissing` when LibreOffice is not installed and
 * `officeFailed` when it cannot convert the file.
 */
export function toPdf(pptx: Uint8Array): Promise<Uint8Array> {
  const run = queue.then(() => convert(pptx));
  queue = run.catch(() => {});
  return run;
}

async function convert(pptx: Uint8Array) {
  const soffice = officePath();
  if (!soffice) throw new Error("officeMissing");
  const dir = await mkdtemp(path.join(tmpdir(), "ap-office-"));
  try {
    const input = path.join(dir, "deck.pptx");
    await writeFile(input, pptx);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        soffice,
        [
          `-env:UserInstallation=${pathToFileURL(path.join(dir, "profile")).href}`,
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--nodefault",
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          input,
        ],
        { stdio: "ignore", windowsHide: true },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("officeFailed"));
      }, TIMEOUT_MS);
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("officeFailed"));
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error("officeFailed"));
      });
    });
    const output = path.join(dir, "deck.pdf");
    if (!existsSync(output)) throw new Error("officeFailed");
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
