import { workstationSignIn } from "@/lib/schemas";
import { body, handler } from "@/server/http";
import { apiTokenOf } from "@/server/services/api-tokens";
import { workstationMessageFor } from "@/server/services/workstation-checks";

/**
 * For the Windows sign-in script: the workstation check to show whoever just signed in, or null.
 *   POST /api/public/workstation/message   { upn, user, computer }
 *   with   Authorization: Bearer <a "Workstation messages" key from Settings → API access>
 * The key reaches nothing else in the app.
 */
export const POST = handler(async (req) => {
  if (!(await apiTokenOf(req, "workstation"))) {
    return Response.json({ error: "A valid workstation key is needed: Authorization: Bearer <key>" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  return { message: await workstationMessageFor(await body(req, workstationSignIn)) };
});
