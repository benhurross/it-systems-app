import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { type AssetLabel, code128, code128Symbols, fitText, layoutLabel, type Mark, printable, toPdf, toZpl } from "@/lib/labels";

const label: AssetLabel = {
  ref: "AST-0142",
  name: "Dell Latitude 5440 laptop",
  serial: "7XK2LM3",
  link: "http://192.168.0.119:3200/a/142",
  owner: "AP Plus IT",
};
const tag = { widthMm: 50, heightMm: 25, dpi: 203 } as const;

const boxes = (marks: Mark[]) => marks.filter((m): m is Extract<Mark, { kind: "box" }> => m.kind === "box");
const texts = (marks: Mark[]) => marks.filter((m): m is Extract<Mark, { kind: "text" }> => m.kind === "text");

describe("Code 128", () => {
  it("writes letters in set B and switches to set C for the digits at the end", () => {
    // Start B, A S T -, to C, 01 42, check, Stop.
    expect(code128Symbols("AST-0142")).toEqual([104, 33, 51, 52, 13, 99, 1, 42, 6, 106]);
  });

  it("starts in set C for digits alone, and stays in B for short runs", () => {
    expect(code128Symbols("123456").slice(0, 4)).toEqual([105, 12, 34, 56]);
    expect(code128Symbols("A12B").slice(0, 5)).toEqual([104, 33, 17, 18, 34]);
    // An odd run: one digit in B, then pairs in C.
    expect(code128Symbols("X12345").slice(0, 5)).toEqual([104, 56, 17, 99, 23]);
  });

  it("gives every symbol eleven modules, and Stop thirteen", () => {
    const widths = code128("AST-0142");
    expect(widths.length % 6).toBe(1);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(9 * 11 + 13);
  });

  it("refuses what it cannot encode", () => {
    expect(() => code128("سري")).toThrow();
  });
});

describe("text on a label", () => {
  it("keeps what the printer's font can show", () => {
    expect(printable("Café  laptop ^1~2 حاسوب")).toBe("Cafe laptop 1 2");
  });

  it("cuts a long name short to fit", () => {
    expect(fitText("Short", 20, 400)).toBe("Short");
    const cut = fitText("HP EliteBook 840 G10 with docking station and monitor", 20, 200);
    expect(cut.endsWith("...")).toBe(true);
    expect(cut.length).toBeLessThan(25);
  });
});

describe("laying out a tag", () => {
  it("fits a QR code, the words and a barcode on a 50 × 25 mm label at 203 dpi", () => {
    const layout = layoutLabel(label, tag);
    expect(layout).toMatchObject({ width: 400, height: 200, dpi: 203 });
    for (const m of layout.marks) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(400);
      expect(m.y + m.height).toBeLessThanOrEqual(200);
    }
    expect(texts(layout.marks).map((t) => t.text)).toEqual(["AP Plus IT", "AST-0142", expect.stringMatching(/^Dell Latitude 5440/), "S/N 7XK2LM3"]);

    // The barcode: bars across the foot, with ten modules of space either side.
    const barTop = Math.max(...boxes(layout.marks).map((b) => b.y));
    const bars = boxes(layout.marks).filter((b) => b.y === barTop);
    expect(bars).toHaveLength(code128("AST-0142").filter((_, i) => i % 2 === 0).length);
    const moduleWidth = Math.min(...bars.map((b) => b.width));
    expect(moduleWidth).toBeGreaterThanOrEqual(2);
    expect(bars[0].x).toBeGreaterThanOrEqual(10 * moduleWidth);
    expect(400 - (bars.at(-1)!.x + bars.at(-1)!.width)).toBeGreaterThanOrEqual(10 * moduleWidth);

    // The QR code: square modules of at least three dots, left of the words.
    const qr = boxes(layout.marks).filter((b) => b.y < barTop);
    const qrModule = Math.min(...qr.map((b) => b.height));
    expect(qrModule).toBeGreaterThanOrEqual(3);
    const qrRight = Math.max(...qr.map((b) => b.x + b.width));
    expect(Math.min(...texts(layout.marks).map((t) => t.x))).toBeGreaterThan(qrRight);
  });

  it("scales to the printer's resolution", () => {
    const fine = layoutLabel(label, { ...tag, dpi: 300 });
    expect(fine).toMatchObject({ width: 591, height: 295 });
    const ref = texts(fine.marks).find((t) => t.text === "AST-0142")!;
    expect(ref.height).toBeGreaterThan(texts(layoutLabel(label, tag).marks).find((t) => t.text === "AST-0142")!.height);
  });

  it("leaves out the lines that do not fit, but never the asset number", () => {
    const small = layoutLabel({ ...label, ref: "AST-12345" }, { widthMm: 38, heightMm: 25, dpi: 203 });
    const ref = texts(small.marks).find((t) => t.text === "AST-12345")!;
    expect(ref.height).toBeLessThan(37);
    expect(ref.x + ref.width).toBeLessThanOrEqual(small.width);
  });
});

describe("output", () => {
  it("writes ZPL for the printer, each label as often as asked", () => {
    const zpl = toZpl([layoutLabel(label, tag), layoutLabel({ ...label, ref: "AST-0143" }, tag)], 2);
    expect(zpl.match(/\^XA/g)).toHaveLength(2);
    expect(zpl.match(/\^XZ/g)).toHaveLength(2);
    expect(zpl).toContain("^PW400");
    expect(zpl).toContain("^LL200");
    expect(zpl).toContain("^PQ2");
    expect(zpl).toContain("^FDAST-0142^FS");
    expect(zpl).toContain("^FDAST-0143^FS");
  });

  it("draws in ZPL exactly what the PDF draws: every box filled, every line of text in place", () => {
    const layout = layoutLabel(label, tag);
    const drawn: Mark[] = [];
    for (const [, x, y, rest] of toZpl([layout]).matchAll(/\^FO(\d+),(\d+)(\^[^\n]*?)\^FS/g)) {
      const box = /^\^GB(\d+),(\d+),(\d+)$/.exec(rest);
      const text = /^\^A0N,(\d+),\d+\^FD(.*)$/.exec(rest);
      if (box) {
        const [width, height, thickness] = box.slice(1).map(Number);
        // A border as thick as the box's shorter side fills it.
        expect(thickness).toBe(Math.min(width, height));
        drawn.push({ kind: "box", x: Number(x), y: Number(y), width, height });
      } else if (text) {
        const mark = texts(layout.marks).find((t) => t.text === text[2])!;
        drawn.push({ ...mark, x: Number(x), y: Number(y), height: Number(text[1]) });
      }
    }
    expect(drawn).toEqual(layout.marks);
  });

  it("makes a PDF with a page the size of the label for each copy", async () => {
    const pdf = await PDFDocument.load(await toPdf([layoutLabel(label, tag)], 3));
    expect(pdf.getPageCount()).toBe(3);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo((50 / 25.4) * 72, 0);
    expect(height).toBeCloseTo((25 / 25.4) * 72, 0);
  });
});
