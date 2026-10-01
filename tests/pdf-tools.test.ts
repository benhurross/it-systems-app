import { crc32, deflateSync } from "node:zlib";
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractPages,
  formatPageRanges,
  imageKind,
  imagesToPdf,
  jpegOrientation,
  isStampText,
  loadPdf,
  mergePdfs,
  organizePdf,
  pageLabel,
  parsePageRanges,
  PdfToolError,
  splitPdf,
  stampPdf,
} from "@/lib/pdf-tools";

/** A PDF whose pages are told apart by their widths: 100, 101, 102... */
async function pdfOf(pages: number, firstWidth = 100) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([firstWidth + i, 500]);
  return pdf.save({ useObjectStreams: false });
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

function png(width: number, height: number) {
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
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3, 0x80);
  row[0] = 0;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))), chunk("IEND", Buffer.alloc(0))]));
}

describe("reading PDFs", () => {
  it("refuses files that are not PDFs, and PDFs locked with a password", async () => {
    await expect(loadPdf(new TextEncoder().encode("hello"))).rejects.toMatchObject({ problem: "notPdf" });
    const text = new TextDecoder("latin1").decode(await pdfOf(1));
    const locked = new Uint8Array(Buffer.from(text.replace("trailer\n<<", "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 >>"), "latin1"));
    await expect(loadPdf(locked)).rejects.toBeInstanceOf(PdfToolError);
    await expect(loadPdf(locked)).rejects.toMatchObject({ problem: "encrypted" });
  });
});

describe("merging", () => {
  it("puts every page of every file into one PDF, in the order given", async () => {
    const merged = await mergePdfs([await pdfOf(2, 100), await pdfOf(3, 200)]);
    expect(await widths(merged)).toEqual([100, 101, 200, 201, 202]);
  });
});

describe("page ranges", () => {
  it("reads pages as people write them", () => {
    expect(parsePageRanges("1-3, 5, 8-", 10)).toEqual([[0, 1, 2], [4], [7, 8, 9]]);
    expect(parsePageRanges("3-1 6", 10)).toEqual([[0, 1, 2], [5]]);
    expect(parsePageRanges("2–4", 10)).toEqual([[1, 2, 3]]);
    expect(parsePageRanges("1-", 10)).toEqual([[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    for (const bad of ["", "0", "11", "a", "2-12", "1-3x"]) expect(parsePageRanges(bad, 10)).toBeNull();
  });

  it("writes pages back as ranges", () => {
    expect(formatPageRanges([0, 1, 2, 4, 7, 8])).toBe("1-3, 5, 8-9");
    expect(formatPageRanges([4, 0, 4])).toBe("1, 5");
    expect(formatPageRanges([])).toBe("");
  });
});

describe("splitting", () => {
  it("takes out pages, or makes a PDF for each group", async () => {
    const source = await pdfOf(5);
    expect(await widths(await extractPages(source, [3, 0]))).toEqual([103, 100]);
    const parts = await splitPdf(source, [[0, 1], [4]]);
    expect(await Promise.all(parts.map(widths))).toEqual([[100, 101], [104]]);
  });
});

describe("organizing", () => {
  it("reorders, turns and leaves out pages", async () => {
    const source = await PDFDocument.create();
    source.addPage([100, 500]);
    source.addPage([101, 500]).setRotation(degrees(90));
    source.addPage([102, 500]);
    const out = await PDFDocument.load(
      await organizePdf(await source.save(), [
        { index: 2, turn: 0 },
        { index: 1, turn: 270 },
        { index: 0, turn: 90 },
      ]),
    );
    expect(out.getPages().map((p) => [p.getWidth(), p.getRotation().angle])).toEqual([
      [102, 0],
      [101, 0],
      [100, 90],
    ]);
  });
});

describe("images to PDF", () => {
  it("puts each image on its own page, fitted without stretching", async () => {
    const tall = { bytes: png(300, 600), type: "image/png" as const, width: 300, height: 600 };
    const wide = { bytes: png(800, 400), type: "image/png" as const, width: 800, height: 400 };
    const a4 = await PDFDocument.load(await imagesToPdf([tall, wide], { size: "a4", orientation: "auto", margin: 0 }));
    expect(a4.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())])).toEqual([
      [595, 842],
      [842, 595],
    ]);
    const portrait = await PDFDocument.load(await imagesToPdf([wide], { size: "a4", orientation: "portrait", margin: 20 }));
    expect(Math.round(portrait.getPage(0).getWidth())).toBe(595);
    const fit = await PDFDocument.load(await imagesToPdf([tall], { size: "fit", orientation: "auto", margin: 0 }));
    expect([fit.getPage(0).getWidth(), fit.getPage(0).getHeight()]).toEqual([225, 450]);
  });
});

/** The start of a JPEG with an EXIF block saying how to turn it, in either byte order. */
function jpegHead(orientation: number, little = false) {
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(2), ...u16(0x010f), ...u16(2), ...u32(4), ...u32(0), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda, 0, 2]);
}

describe("images", () => {
  it("knows PNG and JPEG by their first bytes", () => {
    expect(imageKind(png(2, 2))).toBe("image/png");
    expect(imageKind(jpegHead(1))).toBe("image/jpeg");
    expect(imageKind(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("reads which way a photo should stand", () => {
    expect(jpegOrientation(jpegHead(6))).toBe(6);
    expect(jpegOrientation(jpegHead(8, true))).toBe(8);
    expect(jpegOrientation(jpegHead(1))).toBe(1);
    // No EXIF, a broken one, or not a JPEG at all: as it is.
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
    expect(jpegOrientation(jpegHead(6).slice(0, 30))).toBe(1);
    expect(jpegOrientation(png(2, 2))).toBe(1);
  });
});

describe("page numbers and watermark", () => {
  it("labels pages in each style, counting from the first number", () => {
    expect(pageLabel("plain", 3, 10)).toBe("3");
    expect(pageLabel("pageOf", 3, 10)).toBe("Page 3 of 10");
    expect(pageLabel("slash", 3, 10)).toBe("3 / 10");
  });

  it("only takes text the standard fonts can write", () => {
    expect(isStampText("CONFIDENTIAL - COPY 2026")).toBe(true);
    expect(isStampText("سري")).toBe(false);
  });

  it("stamps every page and keeps them all", async () => {
    const stamped = await stampPdf(await pdfOf(3), {
      numbers: { position: "bottomRight", style: "pageOf", start: 1, size: 10 },
      watermark: { text: "CONFIDENTIAL", opacity: 0.2, size: 60 },
    });
    const pdf = await PDFDocument.load(stamped);
    expect(pdf.getPageCount()).toBe(3);
    expect(stamped.length).toBeGreaterThan((await pdfOf(3)).length);
  });
});
