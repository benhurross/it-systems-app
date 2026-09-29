import { ticketCreate } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createTicket, listTickets } from "@/server/services/tickets";

/** IT sees every ticket; everyone else sees and raises their own. */
export const GET = handler(async () => {
  const user = await requireUser("request");
  return listTickets(user);
});

export const POST = handler(async (req) => {
  const user = await requireUser("request");
  return createTicket(user, await body(req, ticketCreate));
});
