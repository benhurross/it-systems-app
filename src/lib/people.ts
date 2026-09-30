import { addDays, daysBetween } from "./dates";
import { FORWARDING_DAYS, OFFBOARDING_TASKS, ONBOARDING_PHASES, ONBOARDING_TASKS } from "./domain";

/** The domain of made-up addresses for people with no email on record. `.invalid` is reserved and
 * never delivers, so a placeholder can't reach a real mailbox. */
export const PLACEHOLDER_DOMAIN = "no-email.invalid";
export const isPlaceholderEmail = (email: string) => email.endsWith(`@${PLACEHOLDER_DOMAIN}`);

type Tasks = Record<string, boolean>;

export function onboardingProgress(tasks: Tasks) {
  const done = ONBOARDING_TASKS.filter((t) => tasks[t.key]).length;
  return {
    done,
    total: ONBOARDING_TASKS.length,
    ratio: done / ONBOARDING_TASKS.length,
    phases: ONBOARDING_PHASES.map((phase) => {
      const items = ONBOARDING_TASKS.filter((t) => t.phase === phase);
      return { phase, done: items.filter((t) => tasks[t.key]).length, total: items.length };
    }),
  };
}

export const onboardingComplete = (tasks: Tasks) => ONBOARDING_TASKS.every((t) => tasks[t.key]);

/** Mail is forwarded for 90 days after resignation; then the mailbox is removed. */
export const forwardingEnds = (resignationDate: string) => addDays(resignationDate, FORWARDING_DAYS);

export type LeaverState = "forwarding" | "due" | "completed";

export function leaverState(leaver: { resignationDate: string; tasks: Tasks }, today: string): LeaverState {
  if (OFFBOARDING_TASKS.every((t) => leaver.tasks[t])) return "completed";
  return daysBetween(today, forwardingEnds(leaver.resignationDate)) <= 0 ? "due" : "forwarding";
}

export const forwardingDaysLeft = (resignationDate: string, today: string) =>
  daysBetween(today, forwardingEnds(resignationDate));
