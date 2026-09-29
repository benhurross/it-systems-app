import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ROLES = ["admin", "it_staff", "employee"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Areas of the app. Every API handler and every navigation entry names one.
 * - settings: system configuration, users and the audit log
 * - it: every IT module (tickets for everyone, assets, finance, monitoring...)
 * - request: raising and following your own requests, reading published articles
 */
export type Area = "settings" | "it" | "request";

const AREAS: Record<Role, readonly Area[]> = {
  admin: ["settings", "it", "request"],
  it_staff: ["it", "request"],
  employee: ["request"],
};

export function can(role: string | null | undefined, area: Area): boolean {
  return AREAS[role as Role]?.includes(area) ?? false;
}

// Better Auth's admin plugin only accepts role names it knows, so the three roles are declared here.
export const ac = createAccessControl(defaultStatements);
export const authRoles = {
  admin: ac.newRole(adminAc.statements),
  it_staff: ac.newRole({ user: [], session: [] }),
  employee: ac.newRole({ user: [], session: [] }),
};
