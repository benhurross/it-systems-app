export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

/** Characters that make a spreadsheet read a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings. Strings that look like formulas are defused. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header))];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))));
  return lines.map((line) => line.join(",")).join("\r\n");
}

/** Saves CSV text as a file. The byte-order mark lets Excel read Arabic correctly. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
