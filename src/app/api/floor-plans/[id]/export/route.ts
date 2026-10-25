import { handler, idParam, requireUser } from "@/server/http";
import { exportPlan } from "@/server/services/floor-plans";

export const GET = handler(async (_req, ctx: RouteContext<"/api/floor-plans/[id]/export">) => {
  await requireUser("it");
  const file = await exportPlan(await idParam(ctx));
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});
