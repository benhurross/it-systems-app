import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_NAME, backupName, backupsToRemove, copyFolder, listBackups } from "../scripts/backup-tools";

describe("backup names", () => {
  it("are dated in local time, sort in time order and match the pattern", () => {
    const morning = backupName(new Date(2026, 0, 5, 9, 7, 3));
    expect(morning).toBe("ap-it-2026-01-05_0907");
    expect(backupName(new Date(2026, 0, 5, 9, 7, 3), true)).toBe("ap-it-2026-01-05_090703");
    expect(BACKUP_NAME.test(morning)).toBe(true);
    expect(BACKUP_NAME.test(`${morning}.partial`)).toBe(false);
    const names = [backupName(new Date(2026, 0, 5, 13, 26)), backupName(new Date(2026, 0, 5, 13, 25, 30), true), backupName(new Date(2026, 0, 5, 13, 26, 11), true)];
    expect([...names].sort()).toEqual(["ap-it-2026-01-05_132530", "ap-it-2026-01-05_1326", "ap-it-2026-01-05_132611"]);
  });

  it("keeps the newest, and always at least one", () => {
    const names = ["ap-it-2026-01-03_1230", "ap-it-2026-01-01_1230", "ap-it-2026-01-02_1230"];
    expect(backupsToRemove(names, 2)).toEqual(["ap-it-2026-01-01_1230"]);
    expect(backupsToRemove(names, 14)).toEqual([]);
    expect(backupsToRemove(names, 0)).toEqual(["ap-it-2026-01-01_1230", "ap-it-2026-01-02_1230"]);
  });
});

describe("copying the uploaded files", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "backup-test-"));
    mkdirSync(path.join(root, "uploads", "2026-01"), { recursive: true });
    writeFileSync(path.join(root, "uploads", "2026-01", "a"), "first");
    writeFileSync(path.join(root, "uploads", "2026-01", "b.part"), "half written");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("copies everything the first time, leaving out half-written files", () => {
    const counts = copyFolder(path.join(root, "uploads"), path.join(root, "one"));
    expect(counts).toEqual({ copied: 1, linked: 0 });
    expect(readFileSync(path.join(root, "one", "2026-01", "a"), "utf8")).toBe("first");
    expect(() => statSync(path.join(root, "one", "2026-01", "b.part"))).toThrow();
  });

  it("links what the previous backup already has, and copies only what is new", () => {
    copyFolder(path.join(root, "uploads"), path.join(root, "one"));
    writeFileSync(path.join(root, "uploads", "2026-01", "c"), "new");
    const counts = copyFolder(path.join(root, "uploads"), path.join(root, "two"), path.join(root, "one"));
    expect(counts).toEqual({ copied: 1, linked: 1 });
    expect(statSync(path.join(root, "two", "2026-01", "a")).ino).toBe(statSync(path.join(root, "one", "2026-01", "a")).ino);
    expect(readFileSync(path.join(root, "two", "2026-01", "c"), "utf8")).toBe("new");
  });

  it("lists only finished backups, oldest first", () => {
    for (const name of ["ap-it-2026-01-02_1230", "ap-it-2026-01-01_1230", "ap-it-2026-01-03_1230.partial", "notes"]) mkdirSync(path.join(root, name));
    expect(listBackups(root)).toEqual(["ap-it-2026-01-01_1230", "ap-it-2026-01-02_1230"]);
    expect(listBackups(path.join(root, "missing"))).toEqual([]);
  });
});
