import { licenseInstall } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { addInstall } from "@/server/services/licenses";

export const POST = handler(async (req, ctx: RouteContext<"/api/licenses/[id]/installs">) => {
  const user = await requireUser("it");
  return addInstall(await idParam(ctx), await body(req, licenseInstall), user);
});
