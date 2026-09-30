import type { TicketStatus } from "./domain";

/** "Closed recently" on a person's own dashboard covers this many days. */
export const RECENT_CLOSED_DAYS = 90;

const OPEN: readonly TicketStatus[] = ["open", "in_progress", "on_hold"];

/** Counts for the person who raised the tickets: still being worked on, waiting for them to confirm, and done lately. */
export function requesterSummary(tickets: { status: TicketStatus; closedAt: Date | string | null }[], now = new Date()) {
  const since = now.getTime() - RECENT_CLOSED_DAYS * 24 * 3_600_000;
  return {
    open: tickets.filter((t) => OPEN.includes(t.status)).length,
    awaiting: tickets.filter((t) => t.status === "resolved").length,
    closedRecently: tickets.filter((t) => t.status === "closed" && t.closedAt && new Date(t.closedAt).getTime() >= since).length,
  };
}
