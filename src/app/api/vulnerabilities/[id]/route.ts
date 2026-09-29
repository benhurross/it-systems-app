import { vulnerabilityInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { updateVulnerability } from "@/server/services/risk";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/vulnerabilities/[id]">) => {
  const user = await requireUser("it");
  return updateVulnerability(await idParam(ctx), await body(req, vulnerabilityInput), user);
});
