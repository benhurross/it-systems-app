import { unzlibSync } from "fflate";
import { PDFArray, PDFBool, type PDFContext, PDFDict, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import { loadPdf } from "./pdf-tools";

/**
 * Making a PDF smaller, in the person's browser like the other PDF tools. Pictures are what make
 * a PDF big (scans above all), so each is made no larger than the page needs and saved again as
 * a JPEG; the text, fonts and drawings are kept as they are, so the text can still be selected and
 * searched. Anything left uncompressed is compressed, and leftovers from earlier edits that no
 * page uses any more are dropped.
 */

/**
 * How far to go: pictures no longer than `longest` pixels on their longer side (2000 is a full A4
 * page at about 170 dpi, 1400 about 120 dpi) and saved at `quality`.
 */
export const COMPRESS_LEVELS = {
  recommended: { longest: 2000, quality: 0.72 },
  strong: { longest: 1400, quality: 0.5 },
} as const;
export type CompressLevel = keyof typeof COMPRESS_LEVELS;

/** Pixels, four bytes each: red, green, blue and alpha. */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/**
 * Makes a JPEG of a picture at the given size. The browser does this with a canvas; tests pass
 * their own. The picture is either a JPEG already or pixels.
 */
export type JpegMaker = (source: { jpeg: Uint8Array } | { pixels: Pixels }, width: number, height: number, quality: number) => Promise<Uint8Array>;

export type CompressResult = { bytes: Uint8Array; pictures: number; smaller: number };

/** Pictures smaller than this are left alone: there is little to gain. */
const WORTH_SHRINKING = 16 * 1024;
/** Pixels a picture may have to be unpacked here; bigger ones are left as they are. */
const MOST_PIXELS = 40_000_000;
/** A new picture is kept only if it saves at least a tenth. */
const KEEP_BELOW = 0.9;

const name = (key: string) => PDFName.of(key);

export async function compressPdf(
  bytes: Uint8Array,
  level: CompressLevel,
  makeJpeg: JpegMaker,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressResult> {
  const pdf = await loadPdf(bytes);
  const { context } = pdf;
  dropUnused(context);

  // Masks say which parts of a picture show through; they must stay as they are.
  const masks = new Set<string>();
  const pictures: [PDFRef, PDFRawStream][] = [];
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.lookup(name("Subtype")) !== name("Image")) continue;
    pictures.push([ref, object]);
    for (const key of ["SMask", "Mask"]) {
      const mask = object.dict.get(name(key));
      if (mask instanceof PDFRef) masks.add(mask.tag);
    }
  }
  const toShrink = pictures.filter(([ref]) => !masks.has(ref.tag));

  let smaller = 0;
  for (const [i, [ref, stream]] of toShrink.entries()) {
    onProgress?.(i, toShrink.length);
    const shrunk = await shrinkPicture(context, stream, COMPRESS_LEVELS[level], makeJpeg).catch(() => null);
    if (shrunk) {
      context.assign(ref, shrunk);
      smaller++;
    }
  }
  onProgress?.(toShrink.length, toShrink.length);

  // Some scanners and programs save parts of a PDF without compressing them.
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream && isUncompressed(object)) context.assign(ref, compressed(context, object));
  }
  // What only the replaced pictures used, such as their lengths.
  dropUnused(context);

  return { bytes: await pdf.save({ useObjectStreams: true }), pictures: toShrink.length, smaller };
}

/**
 * Removes what nothing in the document leads to any more. Programs that edit a PDF often add the
 * new version of a page or picture and leave the old one in the file.
 */
function dropUnused(context: PDFContext) {
  const used = new Set<string>();
  const queue: PDFObject[] = [context.trailerInfo.Root, context.trailerInfo.Info].filter((o): o is PDFObject => o !== undefined);
  while (queue.length > 0) {
    const object = queue.pop()!;
    if (object instanceof PDFRef) {
      if (used.has(object.tag)) continue;
      used.add(object.tag);
      const target = context.lookup(object);
      if (target) queue.push(target);
    } else if (object instanceof PDFDict) {
      queue.push(...object.values());
    } else if (object instanceof PDFArray) {
      queue.push(...object.asArray());
    } else if (object instanceof PDFStream) {
      queue.push(object.dict);
    }
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!used.has(ref.tag)) context.delete(ref);
  }
}

function filters(dict: PDFDict): string[] | null {
  const filter = dict.lookup(name("Filter"));
  if (filter === undefined) return [];
  if (filter instanceof PDFName) return [filter.decodeText()];
  if (filter instanceof PDFArray) return filter.asArray().map((f) => (f instanceof PDFName ? f.decodeText() : "?"));
  return null;
}

function isUncompressed(stream: PDFRawStream) {
  const type = stream.dict.lookup(name("Type"));
  // The document's description is kept readable, as the standard advises.
  if (type === name("Metadata") || type === name("XRef") || type === name("ObjStm")) return false;
  return filters(stream.dict)?.length === 0 && !stream.dict.has(name("DecodeParms")) && stream.contents.length > 256;
}

function compressed(context: PDFContext, stream: PDFRawStream) {
  const out = context.flateStream(stream.contents);
  for (const [key, value] of stream.dict.entries()) {
    if (key !== name("Length") && key !== name("Filter")) out.dict.set(key, value);
  }
  return out;
}

const numberOf = (dict: PDFDict, key: string) => {
  const value = dict.lookup(name(key));
  return value instanceof PDFNumber ? value.asNumber() : null;
};

/** How many colour values a pixel has in this colour space: 1 for grey, 3 for colour, or null for others. */
function channels(context: PDFContext, space: PDFObject | undefined): 1 | 3 | null {
  if (space instanceof PDFRef) return channels(context, context.lookup(space));
  if (space === name("DeviceGray") || space === name("CalGray")) return 1;
  if (space === name("DeviceRGB") || space === name("CalRGB")) return 3;
  if (space instanceof PDFArray && space.size() >= 1) {
    const family = space.lookup(0);
    if (family === name("CalGray")) return 1;
    if (family === name("CalRGB")) return 3;
    if (family === name("ICCBased")) {
      const profile = space.lookup(1);
      const n = profile instanceof PDFStream ? numberOf(profile.dict, "N") : null;
      return n === 1 ? 1 : n === 3 ? 3 : null;
    }
  }
  return null;
}

/**
 * The picture made smaller as a JPEG, or null when it cannot be or would not save enough.
 * Pictures in colours a JPEG here cannot hold (print colours, palettes) or with unusual settings
 * are left as they are.
 */
async function shrinkPicture(context: PDFContext, stream: PDFRawStream, level: { longest: number; quality: number }, makeJpeg: JpegMaker) {
  const { dict, contents } = stream;
  if (contents.length < WORTH_SHRINKING) return null;
  const width = numberOf(dict, "Width");
  const height = numberOf(dict, "Height");
  const imageMask = dict.lookup(name("ImageMask"));
  if (!width || !height || numberOf(dict, "BitsPerComponent") !== 8) return null;
  if ((imageMask instanceof PDFBool && imageMask.asBoolean()) || dict.has(name("Decode")) || dict.lookup(name("Mask")) instanceof PDFArray) return null;
  const colours = channels(context, dict.lookup(name("ColorSpace")));
  const applied = filters(dict);
  if (!colours || !applied) return null;

  let source: Parameters<JpegMaker>[0];
  if (applied.length === 1 && applied[0] === "DCTDecode") {
    source = { jpeg: contents };
  } else if (applied.length === 0 || (applied.length === 1 && applied[0] === "FlateDecode")) {
    if (width * height > MOST_PIXELS) return null;
    let raw = applied.length === 0 ? contents : unzlibSync(contents);
    const parms = dict.lookup(name("DecodeParms"));
    const predictor = parms instanceof PDFDict ? (numberOf(parms, "Predictor") ?? 1) : 1;
    if (predictor >= 10) raw = unpredict(raw, width * colours, height, colours);
    else if (predictor !== 1) return null;
    if (raw.length < width * height * colours) return null;
    source = { pixels: toRgba(raw, width, height, colours) };
  } else {
    return null;
  }

  const scale = Math.min(1, level.longest / Math.max(width, height));
  const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  const jpeg = await makeJpeg(source, size.width, size.height, level.quality);
  if (jpeg.length > contents.length * KEEP_BELOW) return null;

  const out = context.stream(jpeg);
  const replaced = ["Filter", "DecodeParms", "Length", "ColorSpace", "BitsPerComponent", "Width", "Height"].map(name);
  for (const [key, value] of dict.entries()) {
    if (!replaced.includes(key)) out.dict.set(key, value);
  }
  out.dict.set(name("Filter"), name("DCTDecode"));
  out.dict.set(name("ColorSpace"), name("DeviceRGB"));
  out.dict.set(name("BitsPerComponent"), PDFNumber.of(8));
  out.dict.set(name("Width"), PDFNumber.of(size.width));
  out.dict.set(name("Height"), PDFNumber.of(size.height));
  return out;
}

/**
 * Undoes the PNG filters a picture's rows may be saved with: each row starts with a byte saying
 * how its values were written relative to the pixel before, the row above, or both.
 */
export function unpredict(data: Uint8Array, rowBytes: number, rows: number, bytesPerPixel: number): Uint8Array {
  const out = new Uint8Array(rowBytes * rows);
  for (let y = 0; y < rows; y++) {
    const from = y * (rowBytes + 1);
    if (from >= data.length) break;
    const type = data[from];
    const row = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const value = data[from + 1 + x] ?? 0;
      const left = x >= bytesPerPixel ? out[row + x - bytesPerPixel] : 0;
      const up = y > 0 ? out[row - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[row - rowBytes + x - bytesPerPixel] : 0;
      let predicted = 0;
      if (type === 1) predicted = left;
      else if (type === 2) predicted = up;
      else if (type === 3) predicted = (left + up) >> 1;
      else if (type === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[row + x] = (value + predicted) & 0xff;
    }
  }
  return out;
}

function toRgba(raw: Uint8Array, width: number, height: number, colours: 1 | 3): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += colours) {
    data[i * 4] = raw[j];
    data[i * 4 + 1] = raw[j + (colours === 3 ? 1 : 0)];
    data[i * 4 + 2] = raw[j + (colours === 3 ? 2 : 0)];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
