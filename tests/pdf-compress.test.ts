import { deflateSync } from "node:zlib";
import {
  concatTransformationMatrix,
  decodePDFRawStream,
  drawObject,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  popGraphicsState,
  pushGraphicsState,
  StandardFonts,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { compressPdf, type JpegMaker, unpredict } from "@/lib/pdf-compress";
import { PdfToolError } from "@/lib/pdf-tools";

/** Bytes that do not compress, as in a photo or a scan. */
function noise(length: number, seed = 1) {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x >> 16;
  }
  return out;
}

/** Stands in for the browser's canvas: records what it was asked for and returns a small "JPEG". */
function fakeJpegs(size = (w: number, h: number) => 200 + Math.round((w * h) / 100)) {
  const calls: { kind: "jpeg" | "pixels"; width: number; height: number; quality: number; pixels?: Uint8ClampedArray }[] = [];
  const make: JpegMaker = async (source, width, height, quality) => {
    calls.push({ kind: "jpeg" in source ? "jpeg" : "pixels", width, height, quality, pixels: "pixels" in source ? source.pixels.data : undefined });
    const bytes = new Uint8Array(size(width, height));
    bytes.set([0xff, 0xd8, 0xff]);
    return bytes;
  };
  return { make, calls };
}

type Picture = { width: number; height: number; contents: Uint8Array; dict?: Record<string, unknown> };

/** A one-page PDF showing the given pictures, with a line of text. */
async function pdfWith(pictures: Picture[], extra?: (pdf: PDFDocument) => void) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText("Quarterly report", { x: 50, y: 800, size: 18, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const refs: PDFRef[] = [];
  for (const [i, p] of pictures.entries()) {
    const stream = pdf.context.stream(p.contents, {
      Type: "XObject",
      Subtype: "Image",
      Width: p.width,
      Height: p.height,
      BitsPerComponent: 8,
      ColorSpace: "DeviceRGB",
      Filter: "DCTDecode",
      ...p.dict,
    });
    const ref = pdf.context.register(stream);
    refs.push(ref);
    const key = page.node.newXObject("Im", ref);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(300, 0, 0, 200, 50, 50 + i * 210), drawObject(key), popGraphicsState());
  }
  extra?.(pdf);
  return { bytes: await pdf.save({ useObjectStreams: false }), refs };
}

/** The pictures in a PDF, with their sizes and how they are saved. */
async function picturesIn(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image"))
    .map(([, o]) => {
      const { dict, contents } = o as PDFRawStream;
      const get = (key: string) => dict.lookup(PDFName.of(key));
      return {
        width: (get("Width") as PDFNumber).asNumber(),
        height: (get("Height") as PDFNumber).asNumber(),
        filter: String(get("Filter")),
        colours: String(get("ColorSpace")),
        smask: dict.get(PDFName.of("SMask")),
        size: contents.length,
      };
    });
}

describe("compressing a PDF", () => {
  it("makes a big photo no larger than the page needs, and keeps the text", async () => {
    const { bytes } = await pdfWith([{ width: 3000, height: 2000, contents: noise(400_000) }]);
    const { make, calls } = fakeJpegs();
    const result = await compressPdf(bytes, "recommended", make);

    expect(calls).toEqual([{ kind: "jpeg", width: 2000, height: 1333, quality: 0.72, pixels: undefined }]);
    expect(result).toMatchObject({ pictures: 1, smaller: 1 });
    expect(result.bytes.length).toBeLessThan(bytes.length / 5);
    expect(await picturesIn(result.bytes)).toEqual([expect.objectContaining({ width: 2000, height: 1333, filter: "/DCTDecode", colours: "/DeviceRGB" })]);

    const out = await PDFDocument.load(result.bytes);
    expect(out.getPageCount()).toBe(1);
    const font = out.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
    expect(font.keys().length).toBe(1);
  });

  it("goes further at the strongest level", async () => {
    const { bytes } = await pdfWith([{ width: 2480, height: 3508, contents: noise(500_000) }]);
    const { make, calls } = fakeJpegs();
    await compressPdf(bytes, "strong", make);
    expect(calls[0]).toMatchObject({ width: 990, height: 1400, quality: 0.5 });
  });

  it("saves pictures kept as pixels as JPEGs, undoing the row filters they were saved with", async () => {
    const width = 300;
    const height = 120;
    const rgb = noise(width * height * 3, 7);
    // Each row filtered a different way, as PNG encoders do.
    const rows: number[] = [];
    for (let y = 0; y < height; y++) {
      const type = y % 5;
      rows.push(type);
      for (let x = 0; x < width * 3; x++) {
        const at = y * width * 3 + x;
        const left = x >= 3 ? rgb[at - 3] : 0;
        const up = y > 0 ? rgb[at - width * 3] : 0;
        const upLeft = y > 0 && x >= 3 ? rgb[at - width * 3 - 3] : 0;
        const p = left + up - upLeft;
        const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft) ? left : Math.abs(p - up) <= Math.abs(p - upLeft) ? up : upLeft;
        const predicted = [0, left, up, (left + up) >> 1, paeth][type];
        rows.push((rgb[at] - predicted) & 0xff);
      }
    }
    const contents = new Uint8Array(deflateSync(Buffer.from(rows)));
    const { bytes } = await pdfWith([
      { width, height, contents, dict: { Filter: "FlateDecode", DecodeParms: { Predictor: 15, Colors: 3, Columns: width, BitsPerComponent: 8 } } },
    ]);
    const { make, calls } = fakeJpegs();
    const result = await compressPdf(bytes, "recommended", make);

    expect(result.smaller).toBe(1);
    expect(calls[0]).toMatchObject({ kind: "pixels", width, height });
    const pixels = calls[0].pixels!;
    for (const i of [0, 1, 2, width * 3 + 5, rgb.length - 1]) {
      const pixel = Math.floor(i / 3);
      expect(pixels[pixel * 4 + (i % 3)]).toBe(rgb[i]);
    }
    expect(pixels[3]).toBe(255);
  });

  it("keeps a picture's transparency mask, and the mask as it was", async () => {
    const mask = { width: 1000, height: 800, contents: new Uint8Array(deflateSync(Buffer.from(noise(1000 * 800, 3)))) };
    const { bytes } = await pdfWith([{ width: 1000, height: 800, contents: noise(200_000) }], (pdf) => {
      const maskRef = pdf.context.register(
        pdf.context.stream(mask.contents, { Type: "XObject", Subtype: "Image", Width: 1000, Height: 800, BitsPerComponent: 8, ColorSpace: "DeviceGray", Filter: "FlateDecode" }),
      );
      const [, picture] = pdf.context.enumerateIndirectObjects().find(([, o]) => o instanceof PDFRawStream && o.dict.lookup(PDFName.of("Width")) instanceof PDFNumber && o.contents.length === 200_000)!;
      (picture as PDFRawStream).dict.set(PDFName.of("SMask"), maskRef);
    });
    const { make, calls } = fakeJpegs();
    const result = await compressPdf(bytes, "recommended", make);

    expect(calls).toHaveLength(1);
    expect(calls[0].kind).toBe("jpeg");
    const pictures = await picturesIn(result.bytes);
    const photo = pictures.find((p) => p.filter === "/DCTDecode")!;
    const kept = pictures.find((p) => p.colours === "/DeviceGray")!;
    expect(photo.smask).toBeInstanceOf(PDFRef);
    expect(kept).toMatchObject({ width: 1000, height: 800, filter: "/FlateDecode", size: mask.contents.length });
  });

  it("leaves pictures it cannot improve as they are", async () => {
    const { bytes } = await pdfWith([
      { width: 2000, height: 2000, contents: noise(300_000, 2), dict: { ColorSpace: "DeviceCMYK" } },
      { width: 40, height: 40, contents: noise(4_000, 4) },
      { width: 900, height: 900, contents: noise(100_000, 5) },
    ]);
    // A JPEG no smaller than the picture it replaces is not worth having.
    const { make, calls } = fakeJpegs(() => 95_000);
    const result = await compressPdf(bytes, "recommended", make);

    expect(calls).toEqual([expect.objectContaining({ width: 900, height: 900 })]);
    expect(result).toMatchObject({ pictures: 3, smaller: 0 });
    expect((await picturesIn(result.bytes)).map((p) => p.size).sort((a, b) => a - b)).toEqual([4_000, 100_000, 300_000]);
  });

  it("drops what no page uses any more, and compresses what was saved uncompressed", async () => {
    const page = "BT /F1 12 Tf 50 700 Td (Hello) Tj ET\n".repeat(200);
    const { bytes } = await pdfWith([], (pdf) => {
      // An old picture an earlier edit left behind.
      pdf.context.register(pdf.context.stream(noise(300_000, 9), { Type: "XObject", Subtype: "Image", Width: 900, Height: 900, BitsPerComponent: 8, ColorSpace: "DeviceRGB", Filter: "DCTDecode" }));
      const contents = pdf.context.register(pdf.context.stream(page));
      pdf.getPage(0).node.addContentStream(contents);
    });
    const { make, calls } = fakeJpegs();
    const result = await compressPdf(bytes, "recommended", make);

    expect(calls).toHaveLength(0);
    expect(bytes.length).toBeGreaterThan(300_000);
    expect(result.bytes.length).toBeLessThan(10_000);
    const out = await PDFDocument.load(result.bytes);
    const streams = out.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream) as [PDFRef, PDFRawStream][];
    const text = streams.map(([, s]) => new TextDecoder().decode(decodePDFRawStream(s).decode())).find((s) => s.includes("(Hello)"));
    expect(text).toBe(page);
    expect(streams.every(([, s]) => s.dict.has(PDFName.of("Filter")))).toBe(true);
  });

  it("refuses what is not a PDF", async () => {
    await expect(compressPdf(new TextEncoder().encode("hello"), "recommended", fakeJpegs().make)).rejects.toEqual(new PdfToolError("notPdf"));
  });

  it("says how far it has got", async () => {
    const { bytes } = await pdfWith([
      { width: 1000, height: 1000, contents: noise(100_000, 1) },
      { width: 1000, height: 1000, contents: noise(100_000, 2) },
    ]);
    const steps: string[] = [];
    await compressPdf(bytes, "recommended", fakeJpegs().make, (done, total) => steps.push(`${done}/${total}`));
    expect(steps).toEqual(["0/2", "1/2", "2/2"]);
  });
});

describe("row filters", () => {
  it("undoes each kind of PNG filter", () => {
    // Two rows of two grey pixels: none, sub; then up, average, paeth on a 1-byte pixel.
    expect(unpredict(new Uint8Array([0, 10, 20, 1, 5, 5]), 2, 2, 1)).toEqual(new Uint8Array([10, 20, 5, 10]));
    expect(unpredict(new Uint8Array([0, 10, 20, 2, 1, 1]), 2, 2, 1)).toEqual(new Uint8Array([10, 20, 11, 21]));
    expect(unpredict(new Uint8Array([0, 10, 20, 3, 1, 1]), 2, 2, 1)).toEqual(new Uint8Array([10, 20, 6, 14]));
    expect(unpredict(new Uint8Array([0, 10, 20, 4, 1, 1]), 2, 2, 1)).toEqual(new Uint8Array([10, 20, 11, 21]));
  });
});
