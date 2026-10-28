import { drawingForm } from "@/server/drawing-form";
import { handler, idParam, requireUser } from "@/server/http";
import { planDrawing, replaceDrawing } from "@/server/services/floor-plans";

/**
 * The drawing, a PDF or an SVG (checked to be one when it was uploaded), always as a download. An
 * SVG may carry script; sandboxed, nothing in it runs even if it is opened here.
 */
export const GET = handler(async (_req, ctx: RouteContext<"/api/floor-plans/[id]/drawing">) => {
  await requireUser("it");
  const file = await planDrawing(await idParam(ctx));
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.format === "svg" ? "image/svg+xml" : "application/pdf",
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
});

/** A new drawing (see drawingForm); without `outlets` the plan keeps its own. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/floor-plans/[id]/drawing">) => {
  const user = await requireUser("it");
  return replaceDrawing(await idParam(ctx), await drawingForm(await req.formData()), user);
});
