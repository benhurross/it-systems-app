import { crc32, deflateSync } from "node:zlib";
import { decodePDFRawStream, degrees, PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { DATE_SHARE, signPdf } from "@/lib/pdf-sign";

/** A signature-shaped PNG, three times as wide as it is tall. */
function png(width = 300, height = 100) {
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
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const row = Buffer.alloc(1 + width * 4, 0);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))), chunk("IEND", Buffer.alloc(0))]));
}

async function onePage(rotation = 0, crop?: [number, number, number, number]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  page.setRotation(degrees(rotation));
  if (crop) page.setCropBox(...crop);
  pdf.addPage([600, 800]);
  return pdf.save();
}

type Matrix = [number, number, number, number, number, number];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

/** A page's drawing instructions, as text; none for a blank page. */
function contentOf(pdf: PDFDocument, pageIndex: number) {
  const contents = pdf.getPage(pageIndex).node.Contents();
  if (!contents) return "";
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r as PDFRef)) : [contents];
  return streams.map((s) => new TextDecoder("latin1").decode(decodePDFRawStream(s as PDFRawStream).decode())).join("\n");
}

/** Where each picture on a page lands, in the page's own coordinates: follows q, Q, cm and Do. */
async function picturesOn(bytes: Uint8Array, pageIndex = 0) {
  const text = contentOf(await PDFDocument.load(bytes), pageIndex);
  const boxes: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  let operands: string[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === "q") stack.push(ctm);
    else if (token === "Q") ctm = stack.pop()!;
    else if (token === "cm") ctm = times(operands.slice(-6).map(Number) as Matrix, ctm);
    else if (token === "Do" && operands.at(-1)?.startsWith("/Image")) {
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => [u * ctm[0] + v * ctm[2] + ctm[4], u * ctm[1] + v * ctm[3] + ctm[5]]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      boxes.push({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) });
    }
    operands = /^[A-Za-z*'"]+$/.test(token) && !token.startsWith("/") ? [] : [...operands, token];
  }
  return boxes;
}

const corner = { page: 0, x: 0, y: 0, width: 0.25, height: 0.1 };

describe("signing a PDF", () => {
  it("puts the signature where it was placed, as large as fits, keeping its shape", async () => {
    const signed = await signPdf(await onePage(), png(), [{ page: 0, x: 0.5, y: 0.75, width: 0.3, height: 0.1 }], null);
    const [box] = await picturesOn(signed);
    // A box 180 × 80 points from (300, 120): the 3:1 signature is 180 × 60, centred, on the box's foot.
    expect(box.minX).toBeCloseTo(300);
    expect(box.maxX).toBeCloseTo(480);
    expect(box.minY).toBeCloseTo(120);
    expect(box.maxY).toBeCloseTo(180);
    expect(await picturesOn(signed, 1)).toEqual([]);
  });

  it("leaves room for the date under the signature, and writes it", async () => {
    const signed = await signPdf(await onePage(), png(), [{ page: 0, x: 0, y: 0, width: 0.5, height: 0.25 }], "15 Oct 2026");
    const [box] = await picturesOn(signed);
    expect(box.minY).toBeCloseTo(800 - 200 + 200 * DATE_SHARE);
    const pdf = await PDFDocument.load(signed);
    expect(contentOf(pdf, 0)).toMatch(/Tj/);
    expect(pdf.getPage(0).node.Resources()!.lookup(PDFName.of("Font"))).toBeDefined();
  });

  it("places as the page is shown on a page saved turned", async () => {
    // The top left as shown is a different corner of the page itself for each turn.
    const expectations: Record<number, (b: Awaited<ReturnType<typeof picturesOn>>[number]) => void> = {
      0: (b) => (expect(b.minX).toBeCloseTo(0), expect(b.maxY).toBeCloseTo(800)),
      90: (b) => (expect(b.minX).toBeCloseTo(0), expect(b.minY).toBeCloseTo(0)),
      180: (b) => (expect(b.maxX).toBeCloseTo(600), expect(b.minY).toBeCloseTo(0)),
      270: (b) => (expect(b.maxX).toBeCloseTo(600), expect(b.maxY).toBeCloseTo(800)),
    };
    for (const [rotation, expectation] of Object.entries(expectations)) {
      // A box exactly the signature's shape, so the signature fills it to the corner.
      const shownWidth = Number(rotation) % 180 === 0 ? 600 : 800;
      const shownHeight = Number(rotation) % 180 === 0 ? 800 : 600;
      const place = { ...corner, width: 0.3, height: (0.3 * shownWidth) / 3 / shownHeight };
      const [box] = await picturesOn(await signPdf(await onePage(Number(rotation)), png(), [place], null));
      expectation(box);
    }
  });

  it("places on the part of the page that is shown, when it is cropped", async () => {
    const place = { ...corner, width: 0.3, height: (0.3 * 400) / 3 / 500 };
    const [box] = await picturesOn(await signPdf(await onePage(0, [100, 50, 400, 500]), png(), [place], null));
    expect(box.minX).toBeCloseTo(100);
    expect(box.maxY).toBeCloseTo(550);
  });

  it("signs several pages, and refuses a page that is not there or a date the font cannot write", async () => {
    const pdf = await onePage();
    const signed = await signPdf(pdf, png(), [corner, { ...corner, page: 1 }, { ...corner, page: 1, x: 0.6 }], null);
    expect(await picturesOn(signed, 0)).toHaveLength(1);
    expect(await picturesOn(signed, 1)).toHaveLength(2);
    await expect(signPdf(pdf, png(), [{ ...corner, page: 2 }], null)).rejects.toThrow(RangeError);
    await expect(signPdf(pdf, png(), [corner], "١٥ أكتوبر")).rejects.toThrow("date");
  });
});
