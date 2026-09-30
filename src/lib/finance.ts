import { addDays, daysBetween } from "./dates";
import type { PurchaseStatus } from "./domain";

export const RENEWAL_WINDOW_DAYS = 90;
export const CONTRACT_STATES = ["active", "expiring", "expired"] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];

export function contractState(contract: { endDate: string }, today: string): ContractState {
  if (contract.endDate < today) return "expired";
  return daysBetween(today, contract.endDate) <= RENEWAL_WINDOW_DAYS ? "expiring" : "active";
}

/** A fiscal year is named by the calendar year it starts in. */
export function fiscalYearOf(date: string, startMonth: number): number {
  const [year, month] = date.split("-").map(Number);
  return month >= startMonth ? year : year - 1;
}

/** [first day, last day] of a fiscal year, inclusive. */
export function fiscalYearRange(fiscalYear: number, startMonth: number): [string, string] {
  const start = `${fiscalYear}-${String(startMonth).padStart(2, "0")}-01`;
  const next = `${fiscalYear + 1}-${String(startMonth).padStart(2, "0")}-01`;
  return [start, addDays(next, -1)];
}

/** Purchases that commit money: anything approved and not rejected. */
export const COMMITTED: readonly PurchaseStatus[] = ["approved", "ordered", "received"];

type Contract = { category: string; startDate: string; endDate: string; annualCost: number };
type Purchase = { category: string; status: PurchaseStatus; amount: number; date: string };
type Budget = { category: string; amount: number };

export type BudgetLine = {
  category: string;
  budget: number;
  contracts: number;
  purchases: number;
  committed: number;
  /** committed / budget; null when nothing was budgeted. */
  utilisation: number | null;
  over: boolean;
};

/** A contract's cost falling inside the fiscal year, prorated by the days it overlaps. */
function contractCostIn(contract: Contract, [start, end]: [string, string]): number {
  const from = contract.startDate > start ? contract.startDate : start;
  const to = contract.endDate < end ? contract.endDate : end;
  const days = daysBetween(from, to) + 1;
  return days > 0 ? (contract.annualCost * days) / (daysBetween(start, end) + 1) : 0;
}

export function budgetLines(
  input: { budgets: Budget[]; contracts: Contract[]; purchases: Purchase[] },
  fiscalYear: number,
  startMonth: number,
): BudgetLine[] {
  const range = fiscalYearRange(fiscalYear, startMonth);
  const categories = new Set([
    ...input.budgets.map((b) => b.category),
    ...input.contracts.map((c) => c.category),
    ...input.purchases.map((p) => p.category),
  ]);

  return [...categories].map((category) => {
    const budget = input.budgets.find((b) => b.category === category)?.amount ?? 0;
    const contracts = input.contracts
      .filter((c) => c.category === category)
      .reduce((sum, c) => sum + contractCostIn(c, range), 0);
    const purchases = input.purchases
      .filter((p) => p.category === category && COMMITTED.includes(p.status))
      .filter((p) => p.date >= range[0] && p.date <= range[1])
      .reduce((sum, p) => sum + p.amount, 0);
    const committed = Math.round(contracts + purchases);
    return {
      category,
      budget,
      contracts: Math.round(contracts),
      purchases: Math.round(purchases),
      committed,
      utilisation: budget > 0 ? committed / budget : null,
      over: committed > budget,
    };
  });
}
