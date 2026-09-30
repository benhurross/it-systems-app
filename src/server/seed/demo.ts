import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { addDays, isoDate } from "@/lib/dates";
import {
  DAILY_CHECKS,
  OFFBOARDING_TASKS,
  ONBOARDING_TASKS,
  ref,
  type Criticality,
  type Priority,
  type RelationType,
  type SupportStatus,
  type TicketStatus,
} from "@/lib/domain";
import { quarterOf } from "@/lib/kpis";
import type { Role } from "@/lib/permissions";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/monitor";
import { isPlaceholderEmail } from "@/lib/people";
import { DEFAULT_SLA } from "@/lib/sla";
import { auth } from "../auth";
import { db } from "../db";
import * as s from "../db/schema";
import {
  CHANGES,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  DEPARTMENT_WEIGHTS,
  FIRST_NAMES,
  KB_ARTICLES,
  LAST_NAMES,
  PROJECTS,
  RISKS,
  TICKET_TEMPLATES,
  TITLES,
  VENDORS,
  VULNERABILITIES,
} from "./demo-data";
import type { Person } from "./people";
import { seedReference } from "./reference";

export { DEMO_PASSWORD } from "./demo-data";

/** An account the seed created, with the password it was given. */
export type DemoAccount = { name: string; email: string; role: Role; password: string; department: string };

/** Everything except the reference lists, which `seedReference` keeps. */
const TABLES = [
  "audit_log",
  "kpi_actuals",
  "daily_checks",
  "discovery_hosts",
  "discovery_runs",
  "alerts",
  "monitor_checks",
  "vulnerabilities",
  "risks",
  "project_tasks",
  "projects",
  "budgets",
  "purchases",
  "contracts",
  "license_installs",
  "licenses",
  "vendors",
  "changes",
  "kb_articles",
  "ticket_comments",
  "tickets",
  "relationships",
  "asset_movements",
  "assets",
  "leavers",
  "joiners",
  "verifications",
  "accounts",
  "sessions",
  "users",
  "employees",
  "settings",
];

type InfraSpec = {
  key: string;
  name: string;
  category: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  location: "jeddah" | "riyadh";
  ip: string | null;
  criticality: Criticality;
  os?: string;
  support?: SupportStatus;
  years: number;
};

const INFRA: InfraSpec[] = [
  { key: "fw-jed", name: "FW-JED-01", category: "security", type: "firewall", manufacturer: "fortinet", model: "FortiGate 100F", location: "jeddah", ip: "10.10.0.1", criticality: "critical", os: "FortiOS 7.4", years: 2 },
  { key: "rtr-jed", name: "RTR-JED-ISP", category: "network", type: "router", manufacturer: "draytek", model: "Vigor 2927", location: "jeddah", ip: "10.10.0.254", criticality: "high", years: 3 },
  { key: "sw-core-jed", name: "SW-JED-CORE", category: "network", type: "switch", manufacturer: "cisco", model: "Catalyst 9300", location: "jeddah", ip: "10.10.0.2", criticality: "critical", years: 2 },
  { key: "sw-jed-1", name: "SW-JED-FL1", category: "network", type: "switch", manufacturer: "cisco", model: "Catalyst 2960", location: "jeddah", ip: "10.10.0.11", criticality: "high", years: 6, support: "end_of_support" },
  { key: "sw-jed-2", name: "SW-JED-FL2", category: "network", type: "switch", manufacturer: "cisco", model: "Catalyst 2960", location: "jeddah", ip: "10.10.0.12", criticality: "high", years: 6, support: "end_of_support" },
  { key: "sw-jed-3", name: "SW-JED-FL3", category: "network", type: "switch", manufacturer: "cisco", model: "Catalyst 9200", location: "jeddah", ip: "10.10.0.13", criticality: "high", years: 1 },
  { key: "ap-jed-1", name: "AP-JED-01", category: "network", type: "access_point", manufacturer: "cisco", model: "Catalyst 9120", location: "jeddah", ip: "10.10.0.21", criticality: "medium", years: 2 },
  { key: "ap-jed-2", name: "AP-JED-02", category: "network", type: "access_point", manufacturer: "cisco", model: "Catalyst 9120", location: "jeddah", ip: "10.10.0.22", criticality: "medium", years: 2 },
  { key: "ap-jed-3", name: "AP-JED-03", category: "network", type: "access_point", manufacturer: "cisco", model: "Catalyst 9120", location: "jeddah", ip: "10.10.0.23", criticality: "medium", years: 2 },
  { key: "ap-jed-4", name: "AP-JED-04", category: "network", type: "access_point", manufacturer: "cisco", model: "Catalyst 9120", location: "jeddah", ip: "10.10.0.24", criticality: "medium", years: 2 },
  { key: "esx-01", name: "ESX-01", category: "servers", type: "physical_server", manufacturer: "dell", model: "PowerEdge R740", location: "jeddah", ip: "10.10.10.11", criticality: "critical", os: "VMware ESXi 7.0", years: 4 },
  { key: "esx-02", name: "ESX-02", category: "servers", type: "physical_server", manufacturer: "dell", model: "PowerEdge R740", location: "jeddah", ip: "10.10.10.12", criticality: "critical", os: "VMware ESXi 7.0", years: 4 },
  { key: "dc01", name: "DC01", category: "servers", type: "virtual_server", manufacturer: "microsoft", model: null, location: "jeddah", ip: "10.10.10.21", criticality: "critical", os: "Windows Server 2019", years: 4 },
  { key: "exch01", name: "EXCH01", category: "servers", type: "virtual_server", manufacturer: "microsoft", model: null, location: "jeddah", ip: "10.10.10.22", criticality: "critical", os: "Exchange Server 2016 CU23", years: 5, support: "end_of_support" },
  { key: "erp01", name: "ERP01", category: "servers", type: "virtual_server", manufacturer: "microsoft", model: null, location: "jeddah", ip: "10.10.10.23", criticality: "critical", os: "Windows Server 2019", years: 4 },
  { key: "siem01", name: "SIEM01", category: "security", type: "virtual_server", manufacturer: null, model: null, location: "jeddah", ip: "10.10.10.60", criticality: "medium", os: "Ubuntu 22.04", years: 3 },
  { key: "backup01", name: "BACKUP01", category: "backup", type: "physical_server", manufacturer: "dell", model: "PowerEdge R540", location: "jeddah", ip: "10.10.10.30", criticality: "high", os: "Veeam Backup 12", years: 3 },
  { key: "nas01", name: "NAS01", category: "backup", type: "storage", manufacturer: "qnap", model: "TS-873A", location: "jeddah", ip: "10.10.10.40", criticality: "high", years: 3 },
  { key: "pbx01", name: "PBX01", category: "communication", type: "pbx", manufacturer: "grandstream", model: "UCM6304", location: "jeddah", ip: "10.10.10.50", criticality: "high", years: 3 },
  { key: "ups-jed", name: "UPS-JED-DC", category: "monitoring", type: "ups", manufacturer: "eaton", model: "9SX 6kVA", location: "jeddah", ip: "10.10.0.60", criticality: "high", years: 5 },
  { key: "nvr-jed", name: "NVR-JED", category: "monitoring", type: "nvr", manufacturer: "hikvision", model: "DS-7616NI", location: "jeddah", ip: "10.10.0.70", criticality: "medium", years: 4 },
  { key: "acs-jed", name: "ACS-JED", category: "monitoring", type: "access_control", manufacturer: "hikvision", model: "DS-K2604", location: "jeddah", ip: "10.10.0.71", criticality: "medium", years: 4 },
  { key: "prn-jed-fin", name: "PRN-JED-FIN", category: "printers", type: "printer", manufacturer: "xerox", model: "VersaLink C7025", location: "jeddah", ip: "10.10.30.11", criticality: "low", years: 3 },
  { key: "prn-jed-ops", name: "PRN-JED-OPS", category: "printers", type: "printer", manufacturer: "xerox", model: "AltaLink C8130", location: "jeddah", ip: "10.10.30.12", criticality: "medium", years: 2 },
  { key: "prn-jed-hr", name: "PRN-JED-HR", category: "printers", type: "printer", manufacturer: "hp", model: "LaserJet M507", location: "jeddah", ip: "10.10.30.13", criticality: "low", years: 5 },
  { key: "prn-jed-exec", name: "PRN-JED-EXEC", category: "printers", type: "printer", manufacturer: "hp", model: "Color LaserJet M455", location: "jeddah", ip: "10.10.30.14", criticality: "low", years: 2 },
  { key: "scn-jed", name: "SCN-JED-01", category: "printers", type: "scanner", manufacturer: "hp", model: "ScanJet Pro 3600", location: "jeddah", ip: "10.10.30.21", criticality: "low", years: 2 },
  { key: "fw-ryd", name: "FW-RYD-01", category: "security", type: "firewall", manufacturer: "fortinet", model: "FortiGate 60F", location: "riyadh", ip: "10.20.0.1", criticality: "critical", os: "FortiOS 7.4", years: 2 },
  { key: "sw-ryd", name: "SW-RYD-CORE", category: "network", type: "switch", manufacturer: "cisco", model: "Catalyst 2960", location: "riyadh", ip: "10.20.0.2", criticality: "high", years: 6, support: "end_of_life" },
  { key: "ap-ryd-1", name: "AP-RYD-01", category: "network", type: "access_point", manufacturer: "cisco", model: "Aironet 1850", location: "riyadh", ip: "10.20.0.21", criticality: "medium", years: 5 },
  { key: "ap-ryd-2", name: "AP-RYD-02", category: "network", type: "access_point", manufacturer: "cisco", model: "Aironet 1850", location: "riyadh", ip: "10.20.0.22", criticality: "medium", years: 5 },
  { key: "ap-ryd-3", name: "AP-RYD-03", category: "network", type: "access_point", manufacturer: "cisco", model: "Aironet 1850", location: "riyadh", ip: "10.20.0.23", criticality: "medium", years: 5 },
  { key: "ups-ryd", name: "UPS-RYD", category: "monitoring", type: "ups", manufacturer: "eaton", model: "5PX 3kVA", location: "riyadh", ip: "10.20.0.60", criticality: "medium", years: 4 },
  { key: "prn-ryd-1", name: "PRN-RYD-01", category: "printers", type: "printer", manufacturer: "xerox", model: "VersaLink B7030", location: "riyadh", ip: "10.20.30.11", criticality: "low", years: 4 },
  { key: "prn-ryd-2", name: "PRN-RYD-02", category: "printers", type: "printer", manufacturer: "hp", model: "LaserJet M507", location: "riyadh", ip: "10.20.30.12", criticality: "low", years: 4 },
  { key: "erp-app", name: "Oasis ERP", category: "software", type: "application", manufacturer: null, model: null, location: "jeddah", ip: null, criticality: "critical", years: 6 },
  { key: "mail-app", name: "Company email", category: "software", type: "application", manufacturer: "microsoft", model: null, location: "jeddah", ip: null, criticality: "critical", years: 5 },
  { key: "files-app", name: "Shared folders", category: "software", type: "application", manufacturer: null, model: null, location: "jeddah", ip: null, criticality: "high", years: 4 },
  { key: "website", name: "Company website", category: "cloud", type: "cloud_service", manufacturer: null, model: null, location: "jeddah", ip: null, criticality: "medium", years: 3 },
];

/** `[source, type, target]`: the ERP app runs on ERP01, which runs on ESX-02, and so on. */
const RELATIONS: [string, RelationType, string][] = [
  ["erp-app", "runs_on", "erp01"],
  ["erp-app", "depends_on", "dc01"],
  ["mail-app", "runs_on", "exch01"],
  ["mail-app", "depends_on", "dc01"],
  ["files-app", "runs_on", "nas01"],
  ["files-app", "depends_on", "dc01"],
  ["dc01", "runs_on", "esx-01"],
  ["exch01", "runs_on", "esx-01"],
  ["erp01", "runs_on", "esx-02"],
  ["siem01", "runs_on", "esx-02"],
  ["esx-01", "depends_on", "sw-core-jed"],
  ["esx-02", "depends_on", "sw-core-jed"],
  ["esx-01", "depends_on", "ups-jed"],
  ["esx-02", "depends_on", "ups-jed"],
  ["nas01", "depends_on", "sw-core-jed"],
  ["backup01", "depends_on", "sw-core-jed"],
  ["pbx01", "depends_on", "sw-core-jed"],
  ["sw-core-jed", "depends_on", "ups-jed"],
  ["sw-core-jed", "depends_on", "fw-jed"],
  ["fw-jed", "depends_on", "rtr-jed"],
  ["sw-jed-1", "connects_to", "sw-core-jed"],
  ["sw-jed-2", "connects_to", "sw-core-jed"],
  ["sw-jed-3", "connects_to", "sw-core-jed"],
  ["ap-jed-1", "connects_to", "sw-jed-1"],
  ["ap-jed-2", "connects_to", "sw-jed-2"],
  ["ap-jed-3", "connects_to", "sw-jed-3"],
  ["ap-jed-4", "connects_to", "sw-jed-3"],
  ["prn-jed-fin", "connects_to", "sw-jed-1"],
  ["prn-jed-ops", "connects_to", "sw-jed-2"],
  ["prn-jed-hr", "connects_to", "sw-jed-3"],
  ["prn-jed-exec", "connects_to", "sw-jed-3"],
  ["scn-jed", "connects_to", "sw-jed-1"],
  ["nvr-jed", "connects_to", "sw-jed-1"],
  ["acs-jed", "connects_to", "sw-jed-1"],
  ["backup01", "backs_up", "dc01"],
  ["backup01", "backs_up", "exch01"],
  ["backup01", "backs_up", "erp01"],
  ["backup01", "backs_up", "nas01"],
  ["fw-ryd", "depends_on", "fw-jed"],
  ["sw-ryd", "depends_on", "fw-ryd"],
  ["sw-ryd", "depends_on", "ups-ryd"],
  ["ap-ryd-1", "connects_to", "sw-ryd"],
  ["ap-ryd-2", "connects_to", "sw-ryd"],
  ["ap-ryd-3", "connects_to", "sw-ryd"],
  ["prn-ryd-1", "connects_to", "sw-ryd"],
  ["prn-ryd-2", "connects_to", "sw-ryd"],
];

/** A small seeded generator, so every run of the demo seed produces the same data. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Wipes the database and fills it with a year of fictional activity, relative to `now`. */
/**
 * Replaces everything with demo data. By default the people are invented; with `people` (a real
 * staff list, see ./people.ts) they are used instead, each account gets a one-time password, and
 * only people already inactive are shown leaving. Tickets, assets and the rest stay fictional.
 */
export async function seedDemo(now = new Date(), options: { people?: Person[] } = {}) {
  const rand = mulberry32(20_260_929);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const chance = (p: number) => rand() < p;
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    let r = rand() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of entries) if ((r -= w) < 0) return value;
    return entries[entries.length - 1][0];
  };
  const hex = () => int(0, 255).toString(16).padStart(2, "0");
  const mac = () => ["02", hex(), hex(), hex(), hex(), hex()].join(":");

  const today = isoDate(now);
  const day = (offset: number) => addDays(today, offset);
  const at = (iso: string, hour: number, minute = 0) => new Date(`${iso}T${pad(hour)}:${pad(minute)}:00+03:00`);
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
  const weekend = (iso: string) => [5, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());

  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
  await seedReference();
  await db.insert(s.settings).values([
    { key: "monitoring", value: { ...DEFAULT_MONITOR_SETTINGS, enabled: false } },
    { key: "organisation", value: { name: "AP Plus", fiscalYearStartMonth: 1 } },
  ]);

  // ---------------------------------------------------------------- directory and accounts

  const people: (typeof s.employees.$inferInsert)[] = [];
  if (options.people) {
    people.push(...options.people.map(({ name, email, department, location, jobTitle, phone, active }) => ({ name, email, department, location, jobTitle, phone, active })));
  } else {
    people.push(
      ...DEMO_ACCOUNTS.map((a) => ({
        name: a.name,
        email: a.email,
        department: a.department,
        location: a.location,
        jobTitle: a.jobTitle,
        phone: `Ext. ${int(200, 899)}`,
      })),
    );
    const names = new Set(people.map((p) => p.name));
    while (people.length < 64) {
      const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      if (names.has(name)) continue;
      names.add(name);
      const department = weighted(DEPARTMENT_WEIGHTS);
      people.push({
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@applus.test`,
        department,
        location: chance(0.7) ? "jeddah" : "riyadh",
        jobTitle: pick(TITLES[department]),
        phone: `Ext. ${int(200, 899)}`,
      });
    }
  }
  const employees = await db.insert(s.employees).values(people).returning();

  /** Employee id to user id, for everyone with an account. */
  const userIds = new Map<number, string>();
  const staffNames: Record<string, string> = {};
  const accounts: DemoAccount[] = [];
  const signUp = async (employee: (typeof employees)[number], role: Role, password: string) => {
    const { user } = await auth.api.createUser({ body: { email: employee.email, name: employee.name, password, role } });
    await db.update(s.users).set({ employeeId: employee.id }).where(eq(s.users.id, user.id));
    userIds.set(employee.id, user.id);
    staffNames[user.id] = employee.name;
    accounts.push({ name: employee.name, email: employee.email, role, password, department: employee.department });
    return user.id;
  };

  // The IT team's parts: an admin who approves, the helpdesk, a systems administrator and an engineer.
  let admin: string, helpdesk: string, sysadmin: string, engineer: string;
  let team: string[];
  if (options.people) {
    for (const [i, person] of options.people.entries()) {
      if (person.role) await signUp(employees[i], person.role, randomBytes(12).toString("base64url"));
    }
    const staff = accounts.filter((a) => a.role !== "employee");
    if (staff.length === 0) throw new Error("No one in the staff list gets an account. Give an active person with an email the admin role.");
    // Executives may hold accounts to see everything, but the IT work goes to everyone else.
    const workers = staff.filter((a) => a.department !== "executive");
    const pool = (workers.length ? workers : staff).map((a) => employees.find((e) => e.email === a.email)!);
    const roleOf = (e: (typeof employees)[number]) => accounts.find((a) => a.email === e.email)!.role;
    const lead = pool.find((e) => roleOf(e) === "admin" && e.department === "it") ?? pool.find((e) => roleOf(e) === "admin") ?? pool[0];
    const rest = pool.filter((e) => e !== lead);
    const first = rest.find((e) => roleOf(e) === "it_staff") ?? rest[0] ?? lead;
    const others = rest.filter((e) => e !== first);
    [admin, helpdesk, sysadmin, engineer] = [lead, first, others[0] ?? first, others[1] ?? others[0] ?? first].map((e) => userIds.get(e.id)!);
    team = pool.map((e) => userIds.get(e.id)!);
  } else {
    for (const account of DEMO_ACCOUNTS) {
      await signUp(employees.find((e) => e.email === account.email)!, account.role, DEMO_PASSWORD);
    }
    const idOf = (email: string) => userIds.get(employees.find((e) => e.email === email)!.id)!;
    [admin, helpdesk, sysadmin, engineer] = ["admin@applus.test", "it@applus.test", "it2@applus.test", "it3@applus.test"].map(idOf);
    team = [admin, helpdesk, sysadmin, engineer];
  }
  const nora = employees.find((e) => e.email === "employee@applus.test") ?? null;
  /** Everyone outside IT still working here: the people who raise tickets. */
  const nonIt = employees.filter((e) => e.active && e.department !== "it" && !team.includes(userIds.get(e.id) ?? ""));
  if (nonIt.length === 0) throw new Error("The staff list needs at least one active person outside IT to raise tickets.");

  // ---------------------------------------------------------------- infrastructure and devices

  const infraRows = await db
    .insert(s.assets)
    .values(
      INFRA.map((a) => {
        const purchased = day(-Math.round(a.years * 365) - int(0, 60));
        // Applications and cloud services have no box to buy or warrant.
        const hardware = a.category !== "software" && a.category !== "cloud";
        return {
          name: a.name,
          category: a.category,
          type: a.type,
          manufacturer: a.manufacturer,
          model: a.model,
          serial: a.ip ? `SN${int(100000, 999999)}${a.key.length}` : null,
          status: "in_use" as const,
          location: a.location,
          purchaseDate: hardware ? purchased : null,
          purchaseCost: !hardware ? null : a.type.includes("server") ? int(18, 42) * 1000 : int(2, 16) * 500,
          warrantyEnd: hardware ? addDays(purchased, a.category === "network" ? 5 * 365 : 3 * 365) : null,
          supportStatus: a.support ?? "supported",
          criticality: a.criticality,
          ipAddress: a.ip,
          macAddress: a.ip && a.type !== "virtual_server" ? mac() : null,
          os: a.os ?? null,
          monitorMethod: a.ip ? ("ping" as const) : ("none" as const),
        };
      }),
    )
    .returning();
  const asset = Object.fromEntries(INFRA.map((a, i) => [a.key, infraRows[i]]));

  const laptopModels = [
    ["dell", "Latitude 5440"],
    ["lenovo", "ThinkPad E14"],
    ["hp", "ProBook 450 G8"],
    ["dell", "Latitude 5420"],
  ] as const;
  const devices: (typeof s.assets.$inferInsert)[] = [];
  let laptops = 0;
  let desktops = 0;
  let monitors = 0;
  const device = (
    kind: "laptop" | "desktop" | "monitor",
    holder: (typeof employees)[number] | null,
    status: "in_use" | "in_stock" | "in_repair" | "retired",
    ageDays: number,
  ) => {
    const purchaseDate = day(-ageDays);
    const [manufacturer, model] =
      kind === "monitor"
        ? pick([["dell", "P2422H"], ["samsung", "S24R650"]] as const)
        : kind === "desktop"
          ? pick([["dell", "OptiPlex 7010"], ["hp", "ProDesk 400 G9"]] as const)
          : pick(laptopModels);
    const number = kind === "laptop" ? ++laptops : kind === "desktop" ? ++desktops : ++monitors;
    devices.push({
      name: `${{ laptop: "LT", desktop: "DT", monitor: "MON" }[kind]}-${String(number).padStart(3, "0")}`,
      category: "end_user",
      type: kind,
      manufacturer,
      model,
      serial: `${manufacturer.slice(0, 2).toUpperCase()}${int(1_000_000, 9_999_999)}`,
      status,
      location: holder?.location ?? "jeddah",
      assignedTo: status === "in_use" ? (holder?.id ?? null) : null,
      purchaseDate,
      purchaseCost: kind === "monitor" ? 800 : kind === "desktop" ? 3200 : 4300,
      warrantyEnd: addDays(purchaseDate, 3 * 365),
      supportStatus: ageDays > 6 * 365 ? "end_of_life" : "supported",
      criticality: "low",
      macAddress: kind === "monitor" ? null : mac(),
      os: kind === "monitor" ? null : ageDays > 5 * 365 ? "Windows 10 Pro" : "Windows 11 Pro",
    });
  };
  for (const person of employees.filter((e) => e.active)) {
    device(chance(0.82) ? "laptop" : "desktop", person, "in_use", int(60, 5 * 365 + 200));
    if (chance(0.45)) device("monitor", person, "in_use", int(60, 4 * 365));
  }
  // Spares from the first lifecycle batch, received about seventy days ago.
  for (let i = 0; i < 4; i++) device("laptop", null, "in_stock", 70);
  for (let i = 0; i < 2; i++) device("laptop", pick(nonIt), "in_repair", int(700, 1400));
  for (let i = 0; i < 5; i++) device(i % 2 ? "desktop" : "laptop", null, "retired", int(6 * 365, 8 * 365));
  const deviceRows = await db.insert(s.assets).values(devices).returning();
  const deviceOf = (employeeId: number) =>
    deviceRows.find((d) => d.assignedTo === employeeId && d.type !== "monitor") ?? null;
  const workstations = deviceRows.filter((d) => d.status === "in_use" && (d.type === "laptop" || d.type === "desktop"));

  await db.insert(s.relationships).values(
    RELATIONS.map(([source, type, target]) => ({ sourceId: asset[source].id, targetId: asset[target].id, type })),
  );

  // A handful of devices changed hands; the register shows it.
  const moved = deviceRows.filter((d) => d.status === "in_use").slice(0, 6);
  await db.insert(s.assetMovements).values(
    moved.map((d, i) => ({
      assetId: d.id,
      fromLocation: "jeddah",
      toLocation: d.location,
      fromEmployeeId: null,
      toEmployeeId: d.assignedTo,
      reason: i % 2 ? "Replacement for a faulty device" : "Issued to a new starter",
      movedBy: staffNames[helpdesk],
      movedAt: at(day(-int(5, 120)), 10),
    })),
  );

  // ---------------------------------------------------------------- tickets

  const templates = Object.entries(TICKET_TEMPLATES);
  const priorities: [Priority, number][] = [
    ["low", 30],
    ["medium", 45],
    ["high", 20],
    ["critical", 5],
  ];
  const satisfaction: [number, number][] = [
    [5, 45],
    [4, 35],
    [3, 12],
    [2, 5],
    [1, 3],
  ];
  const userOfEmployee = (employeeId: number) => userIds.get(employeeId);

  type Draft = typeof s.tickets.$inferInsert & { createdAt: Date };
  const drafts: Draft[] = [];

  // The engineer covers the Riyadh branch. A real list may have no one there, so they share the main
  // queue; and in a small team one person may hold several parts, so each is weighted once.
  const queue: [string, number][] = options.people
    ? ([[helpdesk, 5], [sysadmin, 3], [engineer, 2], [admin, 1]] as [string, number][]).filter(([id], i, all) => all.findIndex(([other]) => other === id) === i)
    : [[helpdesk, 5], [sysadmin, 3], [admin, 1]];
  const draft = (requester: (typeof employees)[number], createdAt: Date, forced?: Partial<Draft>) => {
    const [issueType, template] = weighted(templates.map((t) => [t, t[1].weight] as const));
    const priority = weighted(priorities);
    const assignee = requester.location === "riyadh" && chance(0.6) ? engineer : weighted(queue);
    const target = DEFAULT_SLA[priority];
    const late = chance(0.13);
    const resolvedAt = new Date(createdAt.getTime() + target * (late ? 1.1 + rand() * 1.9 : 0.05 + rand() * 0.8) * HOUR);
    let status: TicketStatus;
    let closedAt: Date | null = null;
    let score: number | null = null;
    // Most of the last week's tickets are still being worked, so the queue is never empty.
    const recent = now.getTime() - createdAt.getTime() < 7 * 24 * HOUR;
    if (resolvedAt > now || (recent && chance(0.7))) {
      status = weighted([["open", 4], ["in_progress", 4], ["on_hold", 1]] as const);
    }
    else if (now.getTime() - resolvedAt.getTime() < 3 * 24 * HOUR && chance(0.5)) status = "resolved";
    else {
      status = "closed";
      closedAt = new Date(Math.min(resolvedAt.getTime() + int(1, 30) * HOUR, now.getTime() - HOUR));
      score = chance(0.7) ? weighted(satisfaction) : null;
    }
    const done = status === "resolved" || status === "closed";
    drafts.push({
      type: issueType === "security" || chance(0.2) ? "incident" : "request",
      status,
      priority,
      issueType,
      location: requester.location,
      subject: pick(template.subjects),
      description: `Reported from the ${requester.location === "riyadh" ? "Riyadh branch" : "Jeddah office"}. The user needs this for their daily work.`,
      requesterId: requester.id,
      assigneeId: status === "open" && chance(0.3) ? null : assignee,
      assetId: (forced?.issueType ?? issueType) === "hardware" ? (deviceOf(requester.id)?.id ?? null) : null,
      dueAt: new Date(createdAt.getTime() + target * HOUR),
      resolvedAt: done ? resolvedAt : null,
      closedAt,
      resolution: done ? template.resolution : null,
      satisfaction: score,
      reopenCount: done && chance(0.03) ? 1 : 0,
      createdBy: userOfEmployee(requester.id) ?? assignee,
      createdAt,
      ...forced,
    });
  };

  for (let back = 364; back >= 0; back--) {
    const date = day(-back);
    if (weekend(date)) continue;
    const count = weighted([[1, 2], [2, 4], [3, 3], [4, 1]] as const);
    const opens = at(date, 8).getTime();
    // Today's tickets arrive between the start of the day and now.
    const closes = back === 0 ? now.getTime() : at(date, 17).getTime();
    for (let i = 0; i < count && closes > opens; i++) {
      draft(pick(nonIt), new Date(opens + rand() * (closes - opens)));
    }
  }
  // The employee demo account's own requests: one in progress, one waiting for them to confirm.
  if (nora) {
    draft(nora, ago(50), {
      subject: "Excel keeps crashing",
      issueType: "software",
      priority: "medium",
      status: "in_progress",
      assigneeId: helpdesk,
      resolvedAt: null,
      closedAt: null,
      resolution: null,
      satisfaction: null,
      dueAt: new Date(ago(50).getTime() + 24 * HOUR),
    });
    draft(nora, ago(26), {
      subject: "VPN not connecting from home",
      issueType: "internet",
      priority: "high",
      status: "resolved",
      assigneeId: sysadmin,
      resolvedAt: ago(3),
      closedAt: null,
      satisfaction: null,
      resolution: "Your VPN profile was renewed. Please try again and confirm it works.",
      dueAt: new Date(ago(26).getTime() + 8 * HOUR),
    });
    for (const back of [20, 45, 80]) draft(nora, at(day(-back), 10), {});
  }
  // One ticket parked while a part is on order.
  draft(nonIt[Math.min(7, nonIt.length - 1)], ago(76), {
    subject: "Laptop battery not charging",
    issueType: "hardware",
    priority: "low",
    status: "on_hold",
    assigneeId: helpdesk,
    resolvedAt: null,
    closedAt: null,
    resolution: null,
    satisfaction: null,
    dueAt: new Date(ago(76).getTime() + 72 * HOUR),
  });

  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const ticketRows = await db.insert(s.tickets).values(drafts).returning();

  const comments: (typeof s.ticketComments.$inferInsert)[] = [];
  const history: (typeof s.auditLog.$inferInsert)[] = [];
  for (const t of ticketRows) {
    const creator = t.createdBy ? staffNames[t.createdBy] : undefined;
    const requesterName = employees.find((e) => e.id === t.requesterId)!.name;
    const assignee = t.assigneeId ?? helpdesk;
    history.push({
      at: t.createdAt,
      userId: t.createdBy,
      userName: creator ?? requesterName,
      action: "create",
      entity: "ticket",
      entityId: String(t.id),
      summary: `Opened ${ref("ticket", t.id)}: ${t.subject}`,
    });
    if (chance(0.3)) {
      comments.push({
        ticketId: t.id,
        authorId: assignee,
        authorName: staffNames[assignee],
        body: pick(["Looking into this now.", "Can you restart the device and try again?", "I will come to your desk shortly."]),
        createdAt: new Date(t.createdAt.getTime() + int(5, 90) * 60_000),
      });
    }
    if (t.resolvedAt) {
      history.push({
        at: t.resolvedAt,
        userId: assignee,
        userName: staffNames[assignee],
        action: "update",
        entity: "ticket",
        entityId: String(t.id),
        summary: `Updated ${ref("ticket", t.id)}: status resolved`,
      });
    }
    if (t.closedAt) {
      const closer = userOfEmployee(t.requesterId) ?? assignee;
      history.push({
        at: t.closedAt,
        userId: closer,
        userName: staffNames[closer],
        action: "update",
        entity: "ticket",
        entityId: String(t.id),
        summary: `Updated ${ref("ticket", t.id)}: status closed${t.satisfaction ? `, rated ${t.satisfaction}/5` : ""}`,
      });
    }
  }
  await db.insert(s.ticketComments).values(comments);
  await db.insert(s.auditLog).values(history);

  // ---------------------------------------------------------------- knowledge base and changes

  await db.insert(s.kbArticles).values(
    KB_ARTICLES.map((a, i) => ({
      ...a,
      status: i === 10 ? ("draft" as const) : i === 11 ? ("retired" as const) : ("published" as const),
      reviewDue: i === 3 ? day(-5) : day(int(30, 300)),
      authorId: i % 2 ? helpdesk : sysadmin,
      createdAt: at(day(-int(30, 300)), 11),
    })),
  );

  const vendorRows = await db
    .insert(s.vendors)
    .values(
      VENDORS.map((v) => ({
        name: v.name,
        category: v.category,
        contactName: v.contactName,
        email: `${v.key}@vendors.test`,
        phone: v.phone,
        active: "active" in v ? v.active : true,
      })),
    )
    .returning();
  const vendor = Object.fromEntries(VENDORS.map((v, i) => [v.key, vendorRows[i].id]));

  await db.insert(s.changes).values(
    CHANGES.map((c) => {
      const plannedAt = at(day(c.days), 22);
      return {
        title: c.title,
        assetId: asset[c.asset].id,
        description: `${c.title}, during the evening maintenance window.`,
        reason: c.risk === "high" ? "Closes a security exposure reported by the vendor." : "Keeps the system supported and stable.",
        risk: c.risk,
        rollbackPlan: "Restore the configuration or snapshot taken immediately before the change.",
        plannedAt,
        status: c.status,
        result: c.result,
        vendor: c.asset.startsWith("fw") ? "Falcon Security Solutions" : null,
        requestedBy: sysadmin,
        approvedBy: c.status === "approved" || c.status === "implemented" ? admin : null,
        implementedAt: c.status === "implemented" ? new Date(plannedAt.getTime() + HOUR) : null,
        createdAt: at(day(Math.min(c.days, 0) - int(3, 10)), 9),
      };
    }),
  );

  // ---------------------------------------------------------------- software licences

  const licenseSpecs = [
    { product: "Microsoft Office 2021 Standard", vendor: "asl", type: "volume", seats: 70, expiry: null, cost: 98_000, on: workstations.slice(0, 66) },
    { product: "Windows 11 Pro", vendor: "desert", type: "oem", seats: 80, expiry: null, cost: 0, on: workstations },
    { product: "Windows Server 2022 Standard", vendor: "asl", type: "perpetual", seats: 6, expiry: null, cost: 21_000, on: ["dc01", "erp01", "backup01", "esx-01", "esx-02"].map((k) => asset[k]) },
    { product: "VMware vSphere Standard", vendor: "asl", type: "subscription", seats: 2, expiry: day(140), cost: 16_500, on: [asset["esx-01"], asset["esx-02"]] },
    { product: "Veeam Backup & Replication", vendor: "asl", type: "subscription", seats: 10, expiry: day(200), cost: 12_400, on: [asset.backup01] },
    { product: "Trend Micro Apex One", vendor: "falcon", type: "subscription", seats: 90, expiry: day(45), cost: 22_000, on: workstations },
    { product: "FortiGate protection bundle", vendor: "falcon", type: "subscription", seats: 2, expiry: day(300), cost: 18_500, on: [asset["fw-jed"], asset["fw-ryd"]] },
    { product: "Adobe Acrobat Pro", vendor: "asl", type: "subscription", seats: 10, expiry: day(120), cost: 9_500, on: workstations.slice(0, 12) },
    { product: "AutoCAD LT", vendor: "asl", type: "subscription", seats: 2, expiry: day(-10), cost: 7_800, on: workstations.slice(20, 22) },
    { product: "Oasis ERP client access", vendor: "erp", type: "perpetual", seats: 45, expiry: null, cost: 60_000, on: workstations.slice(10, 48) },
    { product: "SQL Server 2019 Standard", vendor: "asl", type: "perpetual", seats: 2, expiry: null, cost: 14_000, on: [asset.erp01] },
    { product: "Nessus Professional", vendor: "falcon", type: "subscription", seats: 1, expiry: day(20), cost: 14_200, on: [asset.siem01] },
    { product: "Grandstream UCM licence", vendor: "gns", type: "perpetual", seats: 1, expiry: null, cost: 2_500, on: [asset.pbx01] },
    { product: "Hikvision video management", vendor: "desert", type: "perpetual", seats: 1, expiry: null, cost: 1_800, on: [asset["nvr-jed"]] },
    { product: "Microsoft Visio Standard", vendor: "asl", type: "perpetual", seats: 5, expiry: null, cost: 3_900, on: workstations.slice(30, 34) },
  ] as const;
  const licenseRows = await db
    .insert(s.licenses)
    .values(
      licenseSpecs.map((l) => ({
        product: l.product,
        vendorId: vendor[l.vendor],
        type: l.type,
        seats: l.seats,
        purchaseDate: day(-int(60, 700)),
        expiryDate: l.expiry,
        cost: l.cost,
        owner: "it",
        reference: `Stored in the IT licence vault, entry ${l.product.split(" ")[0].toUpperCase()}`,
      })),
    )
    .returning();
  await db.insert(s.licenseInstalls).values(
    licenseSpecs.flatMap((l, i) => l.on.map((a) => ({ licenseId: licenseRows[i].id, assetId: a.id }))),
  );

  // ---------------------------------------------------------------- contracts, purchases and budget

  const contractSpecs: [string, string, string, string | null, number, number, number, boolean][] = [
    ["Main dedicated internet, Jeddah", "hijaz", "connectivity", "jeddah", 22_320, -200, 165, true],
    ["Backup internet line, Jeddah", "najd", "connectivity", "jeddah", 12_000, -300, 65, false],
    ["Branch internet, Riyadh", "najd", "connectivity", "riyadh", 15_600, -100, 265, true],
    ["Site-to-site VPN service", "hijaz", "connectivity", null, 36_000, -400, -35, false],
    ["Printer maintenance and toner", "redsea", "services", null, 28_000, -150, 215, true],
    ["UPS maintenance", "powersafe", "services", "jeddah", 6_500, -330, 35, false],
    ["Firewall support and updates", "falcon", "security", null, 18_500, -65, 300, true],
    ["IT support retainer", "gns", "services", null, 48_000, -250, 115, false],
    ["ERP annual support", "erp", "software", null, 42_000, -20, 345, true],
    ["Website hosting", "peninsula", "cloud", null, 3_600, -180, 185, true],
    ["Offsite backup storage", "peninsula", "cloud", null, 9_600, -40, 325, true],
    ["Microsoft software assurance", "asl", "software", null, 54_000, -10, 355, false],
  ];
  await db.insert(s.contracts).values(
    contractSpecs.map(([title, v, category, location, annualCost, start, end, autoRenew]) => ({
      title,
      vendorId: vendor[v],
      category,
      location,
      startDate: day(start),
      endDate: day(end),
      annualCost,
      autoRenew,
    })),
  );

  const purchaseSpecs: [string, string, string, number, number, "requested" | "approved" | "rejected" | "ordered" | "received", number, boolean][] = [
    ["Replacement laptops, lifecycle batch 1", "hardware", "desert", 10, 42_000, "received", -80, true],
    ["Replacement laptops, lifecycle batch 2", "hardware", "desert", 10, 43_500, "ordered", -20, true],
    ["24-inch monitors", "hardware", "desert", 8, 6_400, "received", -150, true],
    ["SSD upgrades for older laptops", "hardware", "desert", 15, 5_250, "received", -200, true],
    ["Access points for the Riyadh branch", "hardware", "gns", 4, 7_600, "received", -45, true],
    ["Core switch for the Riyadh branch", "hardware", "gns", 1, 14_500, "ordered", -15, true],
    ["UPS battery replacement", "hardware", "powersafe", 2, 3_800, "received", -120, true],
    ["Docking stations", "hardware", "desert", 12, 5_400, "approved", -5, true],
    ["Headsets for the sales team", "hardware", "desert", 15, 2_250, "requested", -2, true],
    ["Five more Adobe Acrobat Pro seats", "software", "asl", 5, 4_750, "requested", -3, false],
    ["Visio Standard licences", "software", "asl", 5, 3_900, "received", -170, false],
    ["Vulnerability scanner renewal", "security", "falcon", 1, 14_200, "approved", -8, false],
    ["Phishing simulation service", "security", "falcon", 1, 9_800, "requested", -1, false],
    ["Server memory upgrade for ESX-02", "hardware", "gns", 2, 6_800, "received", -60, true],
    ["Printer for the Riyadh branch", "hardware", "redsea", 1, 4_200, "rejected", -40, true],
    ["Cloud backup storage upgrade", "cloud", "peninsula", 1, 4_800, "received", -30, false],
    ["Network cabling for the new office", "services", "gns", 1, 12_500, "received", -95, false],
    ["External drives for archiving", "hardware", "desert", 4, 1_600, "rejected", -70, true],
    ["Meeting room camera and presenter", "hardware", "desert", 2, 3_100, "received", -110, true],
    ["Firewall log retention add-on", "security", "falcon", 1, 5_600, "ordered", -12, false],
    ["Toner stock", "services", "redsea", 20, 7_000, "received", -25, false],
    ["Mobile phones for managers", "hardware", "desert", 3, 10_500, "approved", -10, true],
    ["Windows Server client access licences", "software", "asl", 25, 6_250, "received", -210, false],
    ["Label printer for asset tags", "hardware", "desert", 1, 950, "received", -130, true],
    ["Fortinet training for two engineers", "services", "falcon", 2, 8_000, "requested", -4, false],
  ];
  const purchaseRows = await db
    .insert(s.purchases)
    .values(
      purchaseSpecs.map(([title, category, v, quantity, amount, status, days, hardware]) => {
        const created = at(day(days), 10);
        const decided = status === "requested" ? null : new Date(created.getTime() + 26 * HOUR);
        return {
          title,
          category,
          vendorId: vendor[v],
          requestedFor: chance(0.4) ? pick(nonIt).id : null,
          quantity,
          amount,
          status,
          hardware,
          requestedBy: pick([helpdesk, sysadmin, engineer]),
          approvedBy: decided ? admin : null,
          decidedAt: decided,
          orderedAt: status === "ordered" || status === "received" ? new Date(created.getTime() + 50 * HOUR) : null,
          receivedAt: status === "received" ? new Date(created.getTime() + 10 * 24 * HOUR) : null,
          createdAt: created,
        };
      }),
    )
    .returning();
  // The newest laptops came from the first lifecycle batch.
  const newest = deviceRows.filter((d) => d.type === "laptop" && d.status === "in_stock");
  for (const d of newest) await db.update(s.assets).set({ purchaseId: purchaseRows[0].id }).where(eq(s.assets.id, d.id));

  const year = Number(today.slice(0, 4));
  const budgetPlan: [string, number][] = [
    ["hardware", 180_000],
    ["software", 150_000],
    ["connectivity", 90_000],
    ["services", 110_000],
    ["security", 60_000],
    ["cloud", 25_000],
  ];
  await db.insert(s.budgets).values(
    [year - 1, year].flatMap((fiscalYear) =>
      budgetPlan.map(([category, amount]) => ({ fiscalYear, category, amount: fiscalYear === year ? amount : amount * 0.9 })),
    ),
  );

  // ---------------------------------------------------------------- projects, risk and security

  for (const [i, p] of PROJECTS.entries()) {
    const [project] = await db
      .insert(s.projects)
      .values({
        name: p.name,
        description: `${p.name}.`,
        ownerId: [admin, sysadmin, engineer][i % 3],
        status: p.status,
        startDate: day(p.start),
        dueDate: day(p.due),
        createdAt: at(day(Math.min(p.start, 0) - 5), 9),
      })
      .returning();
    await db.insert(s.projectTasks).values(
      p.tasks.map(([title, status], j) => ({
        projectId: project.id,
        title,
        status,
        assigneeId: [helpdesk, sysadmin, engineer][(i + j) % 3],
        dueDate: day(p.start + Math.round(((p.due - p.start) * (j + 1)) / p.tasks.length)),
      })),
    );
  }

  await db.insert(s.risks).values(
    RISKS.map((r) => ({
      title: r.title,
      category: r.category,
      assetId: r.asset ? asset[r.asset].id : null,
      description: `${r.title}.`,
      controls: "Reviewed at the monthly IT meeting.",
      likelihood: r.likelihood,
      impact: r.impact,
      treatment: r.treatment,
      ownerId: pick([admin, sysadmin, engineer]),
      status: r.status,
      reviewDate: day(int(10, 90)),
    })),
  );

  await db.insert(s.vulnerabilities).values(
    VULNERABILITIES.map((v) => ({
      title: v.title,
      severity: v.severity,
      assetId: v.asset ? asset[v.asset].id : null,
      description: `${v.title}.`,
      detectedOn: day(-v.daysAgo),
      detectionMethod: pick(["Quarterly vulnerability scan", "Penetration test", "Vendor advisory"]),
      status: v.status,
      deadline: day(v.deadline),
      resolvedOn: v.status === "resolved" ? day(-int(1, v.daysAgo - 1)) : null,
      resolution: v.status === "resolved" ? "Fixed and verified by a rescan." : null,
      ownerId: pick([sysadmin, engineer]),
    })),
  );

  // ---------------------------------------------------------------- joiners and leavers

  const all = Object.fromEntries(ONBOARDING_TASKS.map((t) => [t.key, true]));
  const some = (n: number) => Object.fromEntries(ONBOARDING_TASKS.slice(0, n).map((t) => [t.key, true]));
  const offboard = (n: number) => Object.fromEntries(OFFBOARDING_TASKS.slice(0, n).map((t) => [t, true]));
  let onboarded = 0;
  if (options.people) {
    // The newest hires (the last in the list) finished onboarding. Only people already inactive are
    // shown leaving, so no one still working here appears to have resigned.
    const real = (e: (typeof employees)[number]) => !isPlaceholderEmail(e.email);
    const newest = nonIt.filter(real).slice(-3);
    if (newest.length) {
      await db.insert(s.joiners).values(
        newest.map((e, i) => {
          const startDate = day(-15 - 25 * (newest.length - 1 - i));
          const { name, email, department, location, jobTitle } = e;
          return { name, email, department, location, jobTitle, startDate, tasks: all, employeeId: e.id, completedAt: at(addDays(startDate, 7), 14) };
        }),
      );
    }
    const gone = employees.filter((e) => !e.active && !userIds.has(e.id)).slice(-5);
    const plans = [
      { resignationDate: day(-95), forward: true, tasks: offboard(4), completedAt: null },
      { resignationDate: day(-60), forward: true, tasks: offboard(3), completedAt: null },
      { resignationDate: day(-20), forward: true, tasks: offboard(2), completedAt: null },
      { resignationDate: day(-120), forward: false, tasks: offboard(6), completedAt: at(day(-28), 12) },
      { resignationDate: day(-3), forward: false, tasks: {}, completedAt: null },
    ];
    const colleague = (e: (typeof employees)[number]) => nonIt.find((c) => c.department === e.department && real(c))?.email ?? null;
    if (gone.length) {
      await db.insert(s.leavers).values(
        gone.map((e, i) => {
          const { forward, ...plan } = plans[i];
          return { employeeId: e.id, ...plan, forwardTo: forward ? colleague(e) : null };
        }),
      );
    }
  } else {
    const [finished] = await db
      .insert(s.employees)
      .values({ name: "Rakan Al-Sulami", email: "rakan.al.sulami@applus.test", department: "operations", location: "jeddah", jobTitle: "Claims Officer" })
      .returning();
    await db.insert(s.joiners).values([
      { name: finished.name, email: finished.email, department: "operations", location: "jeddah", jobTitle: "Claims Officer", startDate: day(-40), tasks: all, employeeId: finished.id, completedAt: at(day(-33), 14) },
      { name: "Lina Farouk", email: "lina.farouk@applus.test", department: "sales", location: "riyadh", jobTitle: "Account Manager", startDate: day(3), tasks: some(4) },
      { name: "Hamza Nasser", email: "hamza.nasser@applus.test", department: "finance", location: "jeddah", jobTitle: "Accountant", startDate: day(10), tasks: some(2) },
      { name: "Dima Saleh", email: "dima.saleh@applus.test", department: "hr", location: "jeddah", jobTitle: "HR Specialist", startDate: day(21), tasks: {} },
    ]);

    const leaving = nonIt.slice(-5);
    await db.insert(s.leavers).values([
      { employeeId: leaving[0].id, resignationDate: day(-95), forwardTo: leaving[4].email, tasks: offboard(4), notes: "Mailbox kept for the claims team until handover ends." },
      { employeeId: leaving[1].id, resignationDate: day(-60), forwardTo: leaving[4].email, tasks: offboard(3) },
      { employeeId: leaving[2].id, resignationDate: day(-20), forwardTo: leaving[4].email, tasks: offboard(2) },
      { employeeId: leaving[3].id, resignationDate: day(-120), forwardTo: null, tasks: offboard(6), completedAt: at(day(-28), 12) },
      { employeeId: leaving[4].id, resignationDate: day(-3), forwardTo: null, tasks: {} },
    ]);
    await db.update(s.employees).set({ active: false }).where(eq(s.employees.id, leaving[3].id));
    onboarded = 1;
  }

  // ---------------------------------------------------------------- monitoring history

  const monitored = infraRows.filter((a) => a.monitorMethod !== "none");
  const checks: (typeof s.monitorChecks.$inferInsert)[] = [];
  const states = new Map<number, { status: "up" | "down" | "degraded"; latency: number | null; failures: number }>();
  for (const a of monitored) {
    const base = a.location === "riyadh" ? int(18, 35) : int(1, 12);
    let last: { up: boolean; latencyMs: number | null } = { up: true, latencyMs: base };
    let failures = 0;
    for (let slot = 143; slot >= 0; slot--) {
      const checkedAt = new Date(now.getTime() - slot * 10 * 60_000);
      const down = (a.name === "AP-RYD-03" && slot < 12) || (a.name === "FW-RYD-01" && (slot === 36 || slot === 37));
      const slow = a.name === "PRN-RYD-01" && slot < 6;
      last = down ? { up: false, latencyMs: null } : { up: true, latencyMs: slow ? int(380, 460) : base + int(0, 6) };
      failures = last.up ? 0 : failures + 1;
      checks.push({ assetId: a.id, checkedAt, up: last.up, latencyMs: last.latencyMs });
    }
    states.set(a.id, {
      status: !last.up ? "down" : (last.latencyMs ?? 0) > DEFAULT_MONITOR_SETTINGS.degradedMs ? "degraded" : "up",
      latency: last.latencyMs,
      failures,
    });
  }
  await db.insert(s.monitorChecks).values(checks);
  for (const a of monitored) {
    const state = states.get(a.id)!;
    await db
      .update(s.assets)
      .set({ monitorStatus: state.status, monitorLatencyMs: state.latency, monitorFailures: state.failures, monitorCheckedAt: now })
      .where(eq(s.assets.id, a.id));
  }
  await db.insert(s.alerts).values([
    { assetId: asset["ap-ryd-3"].id, kind: "down", status: "open", openedAt: ago(1.8) },
    { assetId: asset["prn-ryd-1"].id, kind: "degraded", status: "acknowledged", openedAt: ago(0.8), acknowledgedBy: engineer, acknowledgedAt: ago(0.5) },
    { assetId: asset["fw-ryd"].id, kind: "down", status: "resolved", openedAt: ago(6), resolvedAt: ago(5.7) },
    { assetId: asset["sw-jed-2"].id, kind: "degraded", status: "resolved", openedAt: ago(74), resolvedAt: ago(73) },
  ]);

  // A finished sweep of the printer subnet: one device unknown, one printer on a new address.
  const [run] = await db
    .insert(s.discoveryRuns)
    .values({ cidr: "10.10.30.0/24", status: "done", total: 254, scanned: 254, startedBy: engineer, startedAt: ago(49), finishedAt: ago(48.9) })
    .returning();
  const printers = ["prn-jed-fin", "prn-jed-ops", "prn-jed-hr", "scn-jed"].map((k) => asset[k]);
  await db.insert(s.discoveryHosts).values([
    ...printers.map((p) => ({ runId: run.id, ip: p.ipAddress!, hostname: p.name.toLowerCase(), mac: p.macAddress, openPorts: [80, 443, 9100], latencyMs: int(2, 9) })),
    { runId: run.id, ip: "10.10.30.24", hostname: "prn-jed-exec", mac: asset["prn-jed-exec"].macAddress, openPorts: [80, 9100], latencyMs: 4 },
    { runId: run.id, ip: "10.10.30.50", hostname: null, mac: "02:1a:2b:3c:4d:5e", openPorts: [80, 443], latencyMs: 6 },
  ]);

  // ---------------------------------------------------------------- daily checks and KPIs

  const dailyRows: (typeof s.dailyChecks.$inferInsert)[] = [];
  let workdays = 0;
  for (let back = 0; workdays < 14; back++) {
    const date = day(-back);
    if (weekend(date)) continue;
    workdays++;
    DAILY_CHECKS.forEach((item, i) => {
      const done = back > 0 || i < 8;
      dailyRows.push({
        date,
        item,
        done,
        note: item === "ups" && back === 2 ? "Battery at 80%, replacement requested." : null,
        checkedBy: done ? helpdesk : null,
        checkedByName: done ? staffNames[helpdesk] : null,
        checkedAt: done ? at(date, 8, 10 + i) : null,
      });
    });
  }
  await db.insert(s.dailyChecks).values(dailyRows);

  const current = quarterOf(now);
  const actuals: (typeof s.kpiActuals.$inferInsert)[] = [];
  for (const [q, training, iso] of [
    [1, 30, 1],
    [2, 35, 1],
    [3, 28, 0],
    [4, 40, 0],
  ] as const) {
    actuals.push({ year: current.year - 1, quarter: q, kpi: "training_hours", value: training });
    actuals.push({ year: current.year - 1, quarter: q, kpi: "iso_ncs", value: iso });
  }
  for (const [q, training, iso] of [
    [1, 42, 1],
    [2, 38, 0],
    [3, 45, 0],
    [4, 12, 0],
  ] as const) {
    if (q > current.quarter) break;
    actuals.push({ year: current.year, quarter: q, kpi: "training_hours", value: training });
    actuals.push({ year: current.year, quarter: q, kpi: "iso_ncs", value: iso });
  }
  await db.insert(s.kpiActuals).values(actuals);

  return { employees: employees.length + onboarded, assets: infraRows.length + deviceRows.length, tickets: ticketRows.length, accounts };
}
