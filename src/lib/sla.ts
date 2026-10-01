import { hoursBetween } from "./dates";
import type { Priority, TicketStatus } from "./domain";

/**
 * Resolution targets in hours, per priority, and for issue types that have their own (a password
 * reset takes minutes, buying a laptop takes days). Editable in Settings.
 */
export type SlaTargets = Record<Priority, number> & { byIssueType?: Record<string, number> };
export const DEFAULT_SLA: SlaTargets = { critical: 4, high: 8, medium: 24, low: 72, byIssueType: {} };

/** A ticket's target: its issue type's own when it has one, whatever the priority; else its priority's. */
export function slaHours(sla: SlaTargets, priority: Priority, issueType?: string): number {
  return (issueType ? sla.byIssueType?.[issueType] : undefined) ?? sla[priority];
}

export function dueAt(from: Date, priority: Priority, sla: SlaTargets, issueType?: string): Date {
  return new Date(from.getTime() + slaHours(sla, priority, issueType) * 3_600_000);
}

type SlaTicket = {
  status: TicketStatus;
  createdAt: Date | string;
  dueAt: Date | string;
  resolvedAt: Date | string | null;
};

const isResolved = (t: SlaTicket) => t.resolvedAt !== null;

/** Resolved after its due time, or still unresolved past it. */
export function isBreached(t: SlaTicket, now = new Date()): boolean {
  return new Date(t.resolvedAt ?? now) > new Date(t.dueAt);
}

/** Hours from opening to resolution; null while unresolved. */
export function resolutionHours(t: SlaTicket): number | null {
  return t.resolvedAt ? hoursBetween(t.createdAt, t.resolvedAt) : null;
}

/** The workbook's "IT Tasks TAT": the share of resolved tickets resolved within SLA. */
export function slaCompliance(tickets: SlaTicket[]): number | null {
  const resolved = tickets.filter(isResolved);
  if (resolved.length === 0) return null;
  return resolved.filter((t) => !isBreached(t)).length / resolved.length;
}

export function averageResolutionHours(tickets: SlaTicket[]): number | null {
  const hours = tickets.map(resolutionHours).filter((h): h is number => h !== null);
  return hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;
}

/** The workbook's "No. of Complaints": tickets that went past their SLA, resolved or not. */
export function complaints(tickets: SlaTicket[], now = new Date()): number {
  return tickets.filter((t) => isBreached(t, now)).length;
}

export function averageSatisfaction(tickets: { satisfaction: number | null }[]): number | null {
  const scores = tickets.map((t) => t.satisfaction).filter((s): s is number => s !== null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}
