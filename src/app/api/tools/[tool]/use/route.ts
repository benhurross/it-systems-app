import { handler, requireUser } from "@/server/http";
import { recordUse } from "@/server/services/tools";
import { toolParam } from "../../tool-param";

/** Sent when a tool has produced a file: counted, never the file itself. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/tools/[tool]/use">) => {
  const user = await requireUser("request");
  return recordUse(user, await toolParam(ctx));
});
