import type { Severity, VulnStatus } from "./domain";

export const riskScore = (likelihood: number, impact: number) => likelihood * impact;

/** Levels on the 5x5 grid: 1-4 low, 5-9 medium, 10-16 high, 17-25 critical. */
export function riskLevel(score: number): Severity {
  if (score >= 17) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

const OPEN: readonly VulnStatus[] = ["open", "in_progress"];

export function isOverdue(vulnerability: { status: VulnStatus; deadline: string }, today: string): boolean {
  return OPEN.includes(vulnerability.status) && vulnerability.deadline < today;
}
