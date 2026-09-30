import { eq } from "drizzle-orm";
import { ref } from "@/lib/domain";
import { isPlaceholderEmail } from "@/lib/people";
import { db } from "../db";
import { employees, tickets, users } from "../db/schema";
import { getMailConfig } from "../mail/config";
import { queueEmail } from "../mail/outbox";
import { resolutionEmail } from "../mail/templates";
import { autoCloseAt, createResolutionLink } from "./respond";

type Ticket = typeof tickets.$inferSelect;

/**
 * Runs a notification without letting it fail the change that caused it: the ticket is already
 * saved, and a mail problem shows up in the outbox, not as an error to the person working the ticket.
 */
async function quietly(what: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (error) {
    console.error(`Could not prepare the ${what} email:`, error);
  }
}

/** Asks the requester to confirm the fix, with links that work without signing in. */
export function notifyResolved(ticket: Ticket, now = new Date()) {
  return quietly("resolution", async () => {
    const [requester] = await db.select().from(employees).where(eq(employees.id, ticket.requesterId));
    if (!requester || isPlaceholderEmail(requester.email)) return;
    const [resolver] = ticket.assigneeId ? await db.select({ name: users.name }).from(users).where(eq(users.id, ticket.assigneeId)) : [];
    const closesOn = await autoCloseAt(ticket.resolvedAt ?? now);
    const token = await createResolutionLink(ticket.id, requester.id, closesOn, now);
    const { appUrl } = await getMailConfig();
    const email = resolutionEmail({
      ref: ref("ticket", ticket.id),
      subject: ticket.subject,
      requester: requester.name,
      resolver: resolver?.name ?? null,
      resolution: ticket.resolution,
      closesOn,
      link: (locale, answer) => `${appUrl}/${locale}/respond/${token}?answer=${answer}`,
    });
    await queueEmail([{ kind: "resolution", to: requester.email, ticketId: ticket.id, ...email }]);
  });
}
