import { crc32, deflateSync } from "node:zlib";
import { decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFRef } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { LINE_HEIGHT, writeOnPdf } from "@/lib/pdf-write";

async function onePage(rotation = 0) {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]).setRotation(degrees(rotation));
  pdf.addPage([600, 800]);
  return pdf.save();
}

/** Text on a page as pdf.js reads it: each piece with where it starts, in the page's own coordinates. */
async function textOn(bytes: Uint8Array, pageNumber = 1) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  return content.items.flatMap((item) => ("str" in item && item.str.trim() ? [{ text: item.str, x: item.transform[4], y: item.transform[5] }] : []));
}

/** The points a page's lines are drawn through ("x y m", "x y l"), in its own coordinates. */
async function linePoints(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r as PDFRef)) : contents ? [contents] : [];
  const text = streams.map((s) => new TextDecoder("latin1").decode(decodePDFRawStream(s as PDFRawStream).decode())).join("\n");
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\b/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

function png(width = 40, height = 10) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 4, 0);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))), chunk("IEND", Buffer.alloc(0))]));
}

describe("writing on a PDF", () => {
  it("writes text where it was placed, line under line", async () => {
    const written = await writeOnPdf(await onePage(), [{ kind: "text", page: 0, x: 0.1, y: 0.1, size: 12, text: "Sara Ahmed\nFinance" }]);
    const [first, second] = await textOn(written);
    expect(first.text).toBe("Sara Ahmed");
    expect(first.x).toBeCloseTo(60);
    // From the top of the line, 0.9 of the size down to the baseline.
    expect(first.y).toBeCloseTo(800 - 80 - 12 * 0.9);
    expect(second).toMatchObject({ text: "Finance" });
    expect(second.y).toBeCloseTo(first.y - 12 * LINE_HEIGHT);
    expect(await textOn(written, 2)).toEqual([]);
  });

  it("draws ticks and crosses around where they were placed, on a page shown turned too", async () => {
    const tick = await writeOnPdf(await onePage(), [{ kind: "tick", page: 0, x: 0.5, y: 0.5, size: 20 }]);
    const points = await linePoints(tick);
    expect(points.length).toBeGreaterThanOrEqual(3);
    for (const p of points) {
      expect(Math.abs(p.x - 300)).toBeLessThanOrEqual(10);
      expect(Math.abs(p.y - 400)).toBeLessThanOrEqual(10);
    }
    // Shown turned a quarter, a point a quarter across and down the page as shown is near the
    // page's own bottom left: 450 up from the foot as shown is 150 across the page itself.
    const turned = await writeOnPdf(await onePage(90), [{ kind: "cross", page: 0, x: 0.25, y: 0.25, size: 20 }]);
    for (const p of await linePoints(turned)) {
      expect(Math.abs(p.x - 150)).toBeLessThanOrEqual(10);
      expect(Math.abs(p.y - 200)).toBeLessThanOrEqual(10);
    }
  });

  it("places the browser's picture of text the standard font cannot write, and asks for one", async () => {
    const arabic = { kind: "text" as const, page: 0, x: 0.2, y: 0.2, size: 14, text: "سارة أحمد" };
    await expect(writeOnPdf(await onePage(), [arabic])).rejects.toThrow("needsPicture");
    const written = await writeOnPdf(await onePage(), [{ ...arabic, picture: { png: png(), width: 0.2, height: 0.025 } }]);
    const resources = (await PDFDocument.load(written)).getPage(0).node.Resources()!;
    expect(resources.lookup(PDFName.of("XObject"))).toBeDefined();
  });

  it("makes fillable fields instead when asked, with names of their own", async () => {
    const base = await PDFDocument.load(await onePage());
    base.getForm().createTextField("text_1").addToPage(base.getPage(1));
    const written = await writeOnPdf(
      await base.save(),
      [
        { kind: "text", page: 0, x: 0.1, y: 0.1, size: 11, text: "Sara Ahmed" },
        { kind: "text", page: 0, x: 0.1, y: 0.2, size: 11, text: "سارة" },
        { kind: "tick", page: 0, x: 0.5, y: 0.5, size: 14 },
        { kind: "dot", page: 0, x: 0.6, y: 0.5, size: 14 },
        { kind: "text", page: 0, x: 0.3, y: 0.3, size: 11, text: "   " },
      ],
      { asFields: true },
    );
    const pdf = await PDFDocument.load(written);
    const form = pdf.getForm();
    expect(form.getFields().map((f) => f.getName())).toEqual(["text_1", "text_2", "text_3", "check_1", "check_2"]);
    expect(form.getTextField("text_2").getText()).toBe("Sara Ahmed");
    expect(form.getTextField("text_3").getText()).toBe("سارة");
    expect(form.getCheckBox("check_1").isChecked()).toBe(true);
    // Arabic is drawn by the reader, which joins its letters.
    expect(pdf.catalog.getAcroForm()!.dict.get(PDFName.of("NeedAppearances"))?.toString()).toBe("true");
  });

  it("refuses a page that is not there", async () => {
    await expect(writeOnPdf(await onePage(), [{ kind: "dot", page: 5, x: 0.5, y: 0.5, size: 10 }])).rejects.toThrow(RangeError);
  });
});
