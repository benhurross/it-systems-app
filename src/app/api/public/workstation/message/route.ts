import { workstationSignIn } from "@/lib/schemas";
import { body, handler } from "@/server/http";
import { requestIp } from "@/lib/device-match";
import { apiTokenOf } from "@/server/services/api-tokens";
import { recordSighting } from "@/server/services/device-sightings";
import { workstationMessageFor } from "@/server/services/workstation-checks";

/**
 * For the Windows sign-in script, at each sign-in: records what the PC says of itself (for Asset
 * Discovery), and gives the workstation check to show whoever signed in, or null, with the PC's
 * address as the app sees it.
 *   POST /api/public/workstation/message   { upn, user, computer, serial?, mac? }
 *   with   Authorization: Bearer <a "Workstation messages" key from Settings → API access>
 * The key reaches nothing else in the app.
 */
export const POST = handler(async (req) => {
  if (!(await apiTokenOf(req, "workstation"))) {
    return Response.json({ error: "A valid workstation key is needed: Authorization: Bearer <key>" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  const signIn = await body(req, workstationSignIn);
  const device = await recordSighting(signIn, requestIp(req.headers));
  return { message: await workstationMessageFor(signIn), device };
});
