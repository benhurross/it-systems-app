import { drawingForm } from "@/server/drawing-form";
import { handler, idParam, requireUser } from "@/server/http";
import { planDrawing, replaceDrawing } from "@/server/services/floor-plans";

/** The drawing, a PDF (checked to be one when it was uploaded), sent as nothing else. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/floor-plans/[id]/drawing">) => {
  await requireUser("it");
  const file = await planDrawing(await idParam(ctx));
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

/** A new drawing (see drawingForm); without `outlets` the plan keeps its own. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/floor-plans/[id]/drawing">) => {
  const user = await requireUser("it");
  return replaceDrawing(await idParam(ctx), await drawingForm(await req.formData()), user);
});
