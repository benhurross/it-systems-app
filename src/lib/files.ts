/** Uploads are refused above this size. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The file types uploads may be, told apart by their first bytes rather than their names. */
export const UPLOAD_TYPES = {
  "application/pdf": { extension: "pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  "image/png": { extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  "image/jpeg": { extension: "jpg", signature: [0xff, 0xd8, 0xff] },
} as const;
export type UploadType = keyof typeof UPLOAD_TYPES;

/** What a file really is, from its content; null for anything that is not an accepted type. */
export function sniffType(bytes: Uint8Array): UploadType | null {
  for (const [type, { signature }] of Object.entries(UPLOAD_TYPES) as [UploadType, (typeof UPLOAD_TYPES)[UploadType]][]) {
    if (signature.every((byte, i) => bytes[i] === byte)) return type;
  }
  return null;
}

/**
 * A safe name to show and download a file under: no folders, no control characters, not too
 * long, and ending in the extension its content calls for.
 */
export function cleanFileName(name: string, type: UploadType): string {
  const extension = UPLOAD_TYPES[type].extension;
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .trim()
    .replace(/\.[^.]*$/, "")
    .slice(0, 120);
  return `${base || "file"}.${extension}`;
}

export function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

/** An image's width and height in pixels, read from its header; null if it cannot be read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const type = sniffType(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === "image/jpeg") {
    // Walk the segments to the frame header (SOF0-SOF15, not DHT, JPG or DAC), which holds the size.
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + view.getUint16(i + 2);
    }
  }
  return null;
}
