import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

type Row = { name: string; count: number; note?: string | null };
const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Count", value: (r: Row) => r.count },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    expect(toCsv([{ name: "Laptop", count: 3 }], columns)).toBe("Name,Count,Note\r\nLaptop,3,");
  });

  it("quotes commas, quotes and line breaks", () => {
    const csv = toCsv([{ name: 'Dell "Latitude", 14"', count: 1, note: "line one\nline two" }], columns);
    expect(csv.split("\r\n")[1]).toBe('"Dell ""Latitude"", 14""",1,"line one\nline two"');
  });

  it("defuses text that a spreadsheet would run as a formula", () => {
    const rows = ["=HYPERLINK(1)", "+1", "-2", "@SUM(A1)"].map((name) => ({ name, count: 0 }));
    const cells = toCsv(rows, columns).split("\r\n").slice(1).map((line) => line.split(",")[0]);
    expect(cells).toEqual(["'=HYPERLINK(1)", "'+1", "'-2", "'@SUM(A1)"]);
  });

  it("leaves real numbers alone, including negatives", () => {
    expect(toCsv([{ name: "x", count: -5 }], columns).split("\r\n")[1]).toBe("x,-5,");
  });

  it("writes Arabic text unchanged", () => {
    expect(toCsv([{ name: "حاسب محمول", count: 1 }], columns)).toContain("حاسب محمول,1,");
  });
});
