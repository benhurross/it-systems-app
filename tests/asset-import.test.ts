import { describe, expect, it } from "vitest";
import { type ImportContext, planImport } from "@/lib/asset-import";
import { parseCsv } from "@/lib/csv";
import { assetInput } from "@/lib/schemas";

const ctx: ImportContext = {
  lookups: [
    { list: "asset_type", code: "laptop", labelEn: "Laptop", labelAr: "حاسب محمول" },
    { list: "asset_type", code: "printer", labelEn: "Printer", labelAr: "طابعة" },
    { list: "asset_type", code: "switch", labelEn: "Network Switch", labelAr: "سويتش" },
    { list: "asset_category", code: "end_user", labelEn: "End-User Devices", labelAr: "أجهزة المستخدمين" },
    { list: "asset_category", code: "network", labelEn: "Network Devices", labelAr: "أجهزة الشبكة" },
    { list: "location", code: "jeddah", labelEn: "Jeddah Head Office", labelAr: "جدة - المكتب الرئيسي" },
    { list: "location", code: "riyadh", labelEn: "Riyadh Branch", labelAr: "فرع الرياض" },
    { list: "manufacturer", code: "lenovo", labelEn: "Lenovo", labelAr: "Lenovo" },
  ],
  employees: [
    { id: 1, name: "Sara Ahmed", email: "sara.ahmed@example.test", number: "AP-0101", active: true },
    { id: 2, name: "Omar Khalid", email: "omar.k@example.test", number: null, active: true },
    { id: 3, name: "Omar Khalid", email: "omar.khalid@example.test", number: null, active: true },
  ],
  assets: [
    {
      id: 42,
      ...assetInput.parse({
        name: "LT-042", category: "end_user", type: "laptop", status: "in_stock", location: "jeddah",
        supportStatus: "supported", criticality: "low", monitorMethod: "none", serial: "PF3XYZ",
      }),
    },
  ],
};

describe("loading assets from a sheet", () => {
  it("adds rows it does not know, filling in what the sheet leaves out", () => {
    const { rows, unused } = planImport(
      [
        ["Inventory, October"],
        ["Name", "Type", "Location", "Assigned to", "Serial", "Manufacturer", "Purchased", "Cost (SAR)", "AnyDesk ID", "Colour"],
        ["LT-100", "laptop", "Jeddah", "AP-0101", "SN-1", "Lenovo", "31/03/2026", "SAR 4,300", "1 234 567 890", "black"],
        ["SW-CORE", "Network Switch", "فرع الرياض", "", "", "", new Date("2025-01-15T00:00:00Z"), 9800, "", ""],
        [],
      ],
      ctx,
    );
    expect(unused).toEqual(["Colour"]);
    expect(rows.map((r) => [r.line, r.action, r.problems])).toEqual([
      [3, "add", []],
      [4, "add", []],
    ]);
    expect(rows[0].input).toMatchObject({
      name: "LT-100", type: "laptop", category: "end_user", location: "jeddah", assignedTo: 1, status: "in_use", criticality: "low",
      manufacturer: "lenovo", purchaseDate: "2026-03-31", purchaseCost: 4300, anydeskId: "1234567890", supportStatus: "supported",
    });
    expect(rows[1].input).toMatchObject({ category: "network", location: "riyadh", status: "in_stock", criticality: "medium", purchaseDate: "2025-01-15", purchaseCost: 9800 });
  });

  it("updates the asset a row names by tag or serial, and only what its cells fill", () => {
    const { rows } = planImport(
      [
        ["Tag", "Name", "Serial", "AnyDesk ID", "Location", "Assigned to"],
        ["AST-0042", "", "", "123 456 789", "", ""],
        ["", "Renamed", "pf3xyz", "", "", "sara.ahmed@example.test"],
      ],
      ctx,
    );
    expect(rows[0]).toMatchObject({ action: "update", assetId: 42, name: "LT-042", changes: ["anydeskId"] });
    expect(rows[0].input).toMatchObject({ name: "LT-042", location: "jeddah", anydeskId: "123456789" });
    expect(rows[1]).toMatchObject({ action: "skip", problems: [{ code: "repeated", field: "serial", line: 2 }] });

    const again = planImport([["Tag", "Name"], ["42", "LT-042"]], ctx);
    expect(again.rows[0]).toMatchObject({ action: "unchanged", changes: [] });
    // Handed to someone, it is in use.
    const handed = planImport([["Serial", "Name", "Assigned to"], ["PF3XYZ", "LT-042", "Sara Ahmed"]], ctx);
    expect(handed.rows[0]).toMatchObject({ action: "update", changes: ["status", "assignedTo"] });
    expect(handed.rows[0].input).toMatchObject({ assignedTo: 1, status: "in_use" });
  });

  it("leaves out rows with problems, saying what each is", () => {
    const { rows } = planImport(
      [
        ["Name", "Type", "Location", "Assigned to", "Purchased", "IP address", "Tag", "Status"],
        ["", "Laptop", "Jeddah", "", "", "", "", ""],
        ["PRN-1", "Plotter", "Dammam", "Omar Khalid", "2026-02-30", "", "", ""],
        ["LT-7", "Laptop", "Jeddah", "Nobody Here", "", "10.0.0.999", "AST-9999", "lost"],
        ["LT-8", "Laptop", "Jeddah", "", "", "10.0.0.999", "", ""],
      ],
      ctx,
    );
    expect(rows.every((r) => r.action === "skip" && r.input === null)).toBe(true);
    expect(rows[0].problems).toEqual([{ code: "required", field: "name" }]);
    expect(rows[1].problems).toEqual([
      { code: "unknown", field: "type", value: "Plotter" },
      { code: "unknown", field: "location", value: "Dammam" },
      { code: "personAmbiguous", value: "Omar Khalid" },
      { code: "date", field: "purchaseDate", value: "2026-02-30" },
    ]);
    expect(rows[2].problems).toEqual([
      { code: "noTag", value: "AST-9999" },
      { code: "unknown", field: "status", value: "lost" },
      { code: "person", value: "Nobody Here" },
    ]);
    expect(rows[3].problems).toEqual([expect.objectContaining({ code: "invalid", field: "ipAddress" })]);
  });

  it("says when the sheet has no Name column", () => {
    expect(planImport([["Device list"], ["x"]], ctx)).toMatchObject({ rows: [], problem: { code: "noHeader" } });
  });

  it("reads the inventory export back, quotes, commas, semicolons and all", () => {
    expect(parseCsv('﻿Tag,Name,Notes\r\nAST-0042,LT-042,"Screen, cracked ""badly"""\r\n,"two\nlines",\'-5\r\n')).toEqual([
      ["Tag", "Name", "Notes"],
      ["AST-0042", "LT-042", 'Screen, cracked "badly"'],
      ["", "two\nlines", "'-5"],
    ]);
    expect(parseCsv("Name;Type\nLT-1;Laptop")).toEqual([["Name", "Type"], ["LT-1", "Laptop"]]);
    const { rows } = planImport(parseCsv("Tag,Name,Notes\nAST-0042,LT-042,'-5 dead pixels"), ctx);
    expect(rows[0].input?.notes).toBe("-5 dead pixels");
  });
});
