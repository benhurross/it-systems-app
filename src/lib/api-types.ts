/**
 * Response shapes, derived from the services so the client can never drift from the server.
 * JSON turns dates into strings, which `Json` reflects. Type-only imports: nothing server-side is bundled.
 */
import type * as assets from "@/server/services/assets";
import type * as auditLog from "@/server/services/audit-log";
import type * as changes from "@/server/services/changes";
import type * as dailyChecks from "@/server/services/daily-checks";
import type * as finance from "@/server/services/finance";
import type * as kb from "@/server/services/kb";
import type * as licenses from "@/server/services/licenses";
import type * as lookups from "@/server/services/lookups";
import type * as monitoring from "@/server/services/monitoring";
import type * as people from "@/server/services/people";
import type * as projects from "@/server/services/projects";
import type * as risk from "@/server/services/risk";
import type * as tickets from "@/server/services/tickets";
import type * as users from "@/server/services/users";

export type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<F extends (...args: any[]) => Promise<unknown>> = Json<Awaited<ReturnType<F>>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item<F extends (...args: any[]) => Promise<unknown[]>> = Result<F>[number];

export type Lookup = Item<typeof lookups.listLookups>;
export type UserRow = Item<typeof users.listUsers>;
export type AuditEntry = Item<typeof auditLog.listAudit>;
export type Employee = Item<typeof people.listEmployees>;
export type EmployeeProfile = Result<typeof people.employeeProfile>;
export type Staff = Item<typeof people.listStaff>;
export type Joiner = Item<typeof people.listJoiners>;
export type Leaver = Item<typeof people.listLeavers>;
export type Ticket = Item<typeof tickets.listTickets>;
export type TicketDetail = Result<typeof tickets.getTicket>;
export type Article = Item<typeof kb.listArticles>;
export type Change = Item<typeof changes.listChanges>;
export type Asset = Item<typeof assets.listAssets>;
export type AssetDetail = Result<typeof assets.getAsset>;
export type Relationship = Item<typeof assets.listRelationships>;
export type License = Item<typeof licenses.listLicenses>;
export type LicenseDetail = Result<typeof licenses.getLicense>;
export type Vendor = Item<typeof finance.listVendors>;
export type Contract = Item<typeof finance.listContracts>;
export type Purchase = Item<typeof finance.listPurchases>;
export type BudgetSummary = Result<typeof finance.budgetSummary>;
export type Project = Item<typeof projects.listProjects>;
export type ProjectDetail = Result<typeof projects.getProject>;
export type Risk = Item<typeof risk.listRisks>;
export type Vulnerability = Item<typeof risk.listVulnerabilities>;
export type NetworkStatus = Result<typeof monitoring.networkStatus>;
export type Device = NetworkStatus["devices"][number];
export type Alert = Item<typeof monitoring.listAlerts>;
export type DailyChecklist = {
  date: string;
  items: Item<typeof dailyChecks.dailyChecklist>[];
  history: Item<typeof dailyChecks.dailyHistory>[];
};
