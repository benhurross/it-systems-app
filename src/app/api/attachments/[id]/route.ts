import { handler, idParam, requireUser } from "@/server/http";
import { deleteAttachment, getAttachment } from "@/server/services/attachments";

/**
 * The file itself. Only PDFs and PNG or JPEG images are ever stored, judged by their content on
 * upload; the file is sent as that type, and the browser is told not to guess another, so nothing
 * that could run script is ever served. ?view opens it in the browser; otherwise it downloads.
 */
export const GET = handler(async (req, ctx: RouteContext<"/api/attachments/[id]">) => {
  await requireUser("it");
  const file = await getAttachment(await idParam(ctx));
  const disposition = new URL(req.url).searchParams.has("view") ? "inline" : "attachment";
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/attachments/[id]">) => {
  const user = await requireUser("it");
  return deleteAttachment(await idParam(ctx), user);
});
