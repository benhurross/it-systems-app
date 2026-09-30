import { expect, type Page } from "@playwright/test";
import type { Role } from "./env";

// Every page of the app. `:name` stands for the id of a record, filled in by `resolve`.
export const REQUEST = ["/requests", "/requests/new", "/requests/:ticket", "/knowledge", "/knowledge/:article"];
export const IT = [
  "/",
  "/kpis",
  "/tickets",
  "/tickets/new",
  "/tickets/:ticket",
  "/knowledge/new",
  "/knowledge/:article/edit",
  "/changes",
  "/changes/:change",
  "/assets",
  "/assets/:asset",
  "/assets/inventory",
  "/assets/discovery",
  "/cmdb",
  "/software",
  "/software/:license",
  "/network",
  "/network/status",
  "/network/daily",
  "/projects",
  "/projects/:project",
  "/finance",
  "/finance/budget",
  "/finance/purchases",
  "/finance/contracts",
  "/finance/vendors",
  "/risk",
  "/risk/register",
  "/risk/vulnerabilities",
  "/people",
  "/people/directory",
  "/people/directory/:employee",
  "/people/onboarding",
  "/people/offboarding",
];
export const SETTINGS = [
  "/settings",
  "/settings/users",
  "/settings/lists",
  "/settings/service-desk",
  "/settings/monitoring",
  "/settings/kpis",
  "/settings/organisation",
  "/settings/audit",
];

export const ALLOWED: Record<Role, string[]> = {
  admin: [...IT, ...REQUEST, ...SETTINGS],
  it: [...IT, ...REQUEST],
  employee: REQUEST,
};

/** Where each placeholder's id comes from: the first record the role can list. */
const SOURCES: Record<string, string> = {
  ticket: "/api/tickets",
  article: "/api/kb",
  change: "/api/changes",
  asset: "/api/assets",
  license: "/api/licenses",
  project: "/api/projects",
  employee: "/api/employees",
};

/** The route with each placeholder replaced by the id of a record the signed-in role can see. */
export async function resolve(page: Page, route: string) {
  let path = route;
  for (const [, name] of route.matchAll(/:(\w+)/g)) {
    const res = await page.request.get(SOURCES[name]);
    expect(res.ok(), `${SOURCES[name]} answered ${res.status()}`).toBe(true);
    const [first] = (await res.json()) as { id: number }[];
    expect(first, `no ${name} to open`).toBeDefined();
    path = path.replace(`:${name}`, String(first.id));
  }
  return path;
}

export const ALL = [...IT, ...REQUEST, ...SETTINGS];
