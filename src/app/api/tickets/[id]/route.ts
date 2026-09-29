import { ticketUpdate } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { getTicket, updateTicket } from "@/server/services/tickets";

export const GET = handler(async (_req, ctx: RouteContext<"/api/tickets/[id]">) => {
  const user = await requireUser("request");
  return getTicket(user, await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/tickets/[id]">) => {
  const user = await requireUser("request");
  return updateTicket(user, await idParam(ctx), await body(req, ticketUpdate));
});
