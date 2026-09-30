import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { ref } from "@/lib/domain";
import { isPlaceholderEmail } from "@/lib/people";
import { db } from "../db";
import type { Actor } from "../audit";
import { employees, lookups, tickets, users } from "../db/schema";
import { getMailConfig } from "../mail/config";
import { queueEmail } from "../mail/outbox";
import { assignedEmail, newTicketEmail, resolutionEmail, type Locale, type TicketFacts } from "../mail/templates";
import { listStaff } from "./people";
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

/** The ticket as IT emails describe it, with list labels in both languages. */
async function factsOf(ticket: Ticket): Promise<TicketFacts> {
  const [[requester], labels] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, ticket.requesterId)),
    db.select().from(lookups).where(inArray(lookups.list, ["department", "location", "issue_type"])),
  ]);
  const label = (list: string, code: string): Record<Locale, string> => {
    const row = labels.find((l) => l.list === list && l.code === code);
    return { en: row?.labelEn ?? code, ar: row?.labelAr ?? code };
  };
  return {
    ref: ref("ticket", ticket.id),
    type: ticket.type,
    subject: ticket.subject,
    description: ticket.description,
    requester: requester?.name ?? "",
    department: label("department", requester?.department ?? ""),
    location: label("location", ticket.location),
    issueType: label("issue_type", ticket.issueType),
    priority: ticket.priority,
  };
}

const active = or(isNull(users.banned), eq(users.banned, false));
const ticketUrl = (appUrl: string, id: number) => (locale: Locale) => `${appUrl}/${locale}/tickets/${id}`;

/**
 * A ticket that arrived with nobody assigned goes to every admin but the one who opened it, with
 * links to accept it or hand it to someone on the team. The links need the admin to sign in.
 */
export function notifyNewTicket(ticket: Ticket, createdBy: string | null) {
  return quietly("new ticket", async () => {
    const admins = (await db.select().from(users).where(and(eq(users.role, "admin"), active))).filter(
      (a) => a.id !== createdBy && !isPlaceholderEmail(a.email),
    );
    if (admins.length === 0) return;
    const [facts, staff, { appUrl }] = await Promise.all([factsOf(ticket), listStaff(), getMailConfig()]);
    await queueEmail(
      admins.map((admin) => ({
        kind: "new_request" as const,
        to: admin.email,
        ticketId: ticket.id,
        ...newTicketEmail({
          ticket: facts,
          staff: staff.filter((s) => s.id !== admin.id),
          link: (locale, to) => `${appUrl}/${locale}/tickets/${ticket.id}/assign?to=${encodeURIComponent(to)}`,
          open: ticketUrl(appUrl, ticket.id),
        }),
      })),
    );
  });
}

/** Tells the person a ticket was just assigned to, unless they took it themselves. */
export function notifyAssigned(ticket: Ticket, by: Actor) {
  return quietly("assignment", async () => {
    if (!ticket.assigneeId || ticket.assigneeId === by.id) return;
    const [assignee] = await db.select().from(users).where(and(eq(users.id, ticket.assigneeId), active));
    if (!assignee || isPlaceholderEmail(assignee.email)) return;
    const [facts, { appUrl }] = await Promise.all([factsOf(ticket), getMailConfig()]);
    await queueEmail([
      { kind: "assigned", to: assignee.email, ticketId: ticket.id, ...assignedEmail({ ticket: facts, by: by.name, open: ticketUrl(appUrl, ticket.id) }) },
    ]);
  });
}
