import { z } from "zod";
import { body, handler, idParam, requireUser } from "@/server/http";
import { applySighting, SIGHTING_FIELDS } from "@/server/services/device-sightings";

/** Takes into the asset what its PC said at sign-in: { fields: ["name", "ip", "mac", "serial"] }. */
export const POST = handler(async (req, ctx: RouteContext<"/api/device-sightings/[id]/apply">) => {
  const user = await requireUser("it");
  const { fields } = await body(req, z.object({ fields: z.array(z.enum(SIGHTING_FIELDS)).min(1) }));
  return applySighting(await idParam(ctx), fields, user);
});
