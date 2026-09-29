import type { ChangeStatus, PurchaseStatus, TicketStatus } from "./domain";
import { can } from "./permissions";

const TICKET_FLOW: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ["in_progress", "on_hold", "resolved"],
  in_progress: ["open", "on_hold", "resolved"],
  on_hold: ["in_progress", "resolved"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

/**
 * Statuses a role may move a ticket to. IT works the whole flow; the person who raised a
 * ticket can only confirm a resolution (closing it) or say it is not fixed (reopening it).
 */
export function nextStatuses(role: string | null | undefined, from: TicketStatus): readonly TicketStatus[] {
  if (can(role, "it")) return TICKET_FLOW[from];
  return from === "resolved" ? ["closed", "open"] : [];
}

export const isReopen = (from: TicketStatus, to: TicketStatus) =>
  to === "open" && (from === "resolved" || from === "closed");

const CHANGE_FLOW: Record<ChangeStatus, readonly ChangeStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["implemented", "rejected"],
  rejected: [],
  implemented: [],
};

export const nextChangeStatuses = (from: ChangeStatus) => CHANGE_FLOW[from];

const PURCHASE_FLOW: Record<PurchaseStatus, readonly PurchaseStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["ordered", "rejected"],
  ordered: ["received"],
  rejected: [],
  received: [],
};

export const nextPurchaseStatuses = (from: PurchaseStatus) => PURCHASE_FLOW[from];
