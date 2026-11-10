import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ROLES = ["admin", "it_admin", "it_staff", "employee"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Areas of the app. Every API handler and every navigation entry names one.
 * - manager: the IT manager's own: the audit log and Team Management (Admins only)
 * - settings: system configuration and users
 * - it: every IT module (tickets for everyone, assets, finance, monitoring...)
 * - request: raising and following your own requests, reading published articles
 */
export type Area = "manager" | "settings" | "it" | "request";

/**
 * An IT Admin has all an Admin has but the manager's area; nor can they make anyone an Admin or
 * change an Admin's account (services/users.ts).
 */
const AREAS: Record<Role, readonly Area[]> = {
  admin: ["manager", "settings", "it", "request"],
  it_admin: ["settings", "it", "request"],
  it_staff: ["it", "request"],
  employee: ["request"],
};

export function can(role: string | null | undefined, area: Area): boolean {
  return AREAS[role as Role]?.includes(area) ?? false;
}

/** The roles that work in IT: they are given tickets and tasks. */
export const IT_ROLES = ["admin", "it_admin", "it_staff"] as const satisfies readonly Role[];

// Better Auth's admin plugin only accepts role names it knows, so the roles are declared here.
export const ac = createAccessControl(defaultStatements);
export const authRoles = {
  admin: ac.newRole(adminAc.statements),
  // Users are managed through the app's own service, which keeps Admin accounts from IT Admins.
  it_admin: ac.newRole({ user: [], session: [] }),
  it_staff: ac.newRole({ user: [], session: [] }),
  employee: ac.newRole({ user: [], session: [] }),
};
