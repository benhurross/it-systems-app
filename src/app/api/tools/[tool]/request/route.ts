import { toolRequest } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { requestTool } from "@/server/services/tools";
import { toolParam } from "../../tool-param";

export const POST = handler(async (req, ctx: RouteContext<"/api/tools/[tool]/request">) => {
  const user = await requireUser("request");
  const { note } = await body(req, toolRequest);
  return requestTool(user, await toolParam(ctx), note);
});
