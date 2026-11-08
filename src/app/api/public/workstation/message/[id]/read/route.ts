import { workstationRead } from "@/lib/schemas";
import { body, handler, idParam } from "@/server/http";
import { apiTokenOf } from "@/server/services/api-tokens";
import { readWorkstationMessage } from "@/server/services/workstation-checks";

/**
 * "I've read it", from the sign-in window: { upn, user, computer, code }, the code being the one
 * sent with the message. Same key as fetching the message.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/public/workstation/message/[id]/read">) => {
  if (!(await apiTokenOf(req, "workstation"))) {
    return Response.json({ error: "A valid workstation key is needed: Authorization: Bearer <key>" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  return readWorkstationMessage(await idParam(ctx), await body(req, workstationRead));
});
