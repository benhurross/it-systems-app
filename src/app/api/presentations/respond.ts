import { badRequest } from "@/server/http";

/**
 * A stored file as a response, sent as the type it was checked to be on upload; the browser is
 * told not to guess another. `inline` shows it in the browser; otherwise it downloads.
 */
export function fileResponse(file: { bytes: Uint8Array; type: string; name?: string }, options: { inline?: boolean; cache?: string } = {}) {
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.type,
      "Content-Length": String(file.bytes.length),
      ...(file.name ? { "Content-Disposition": `${options.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}` } : {}),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": options.cache ?? "private, no-store",
    },
  });
}

/** The file of a multipart form, as bytes with its name. */
export async function formFile(form: FormData, field: string) {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function requiredFile(form: FormData, field: string) {
  const file = await formFile(form, field);
  if (!file) throw badRequest("fileEmpty");
  return file;
}

/** Long caching for a file asked for with ?v= its version; otherwise checked each time. */
export const versioned = (req: Request) => (new URL(req.url).searchParams.has("v") ? "private, max-age=31536000, immutable" : "private, no-cache");
