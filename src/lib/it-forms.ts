import { z } from "zod";

/**
 * The IT department's paper forms, filled in the app and printed to be signed by hand. Each keeps
 * its document control details (format number, revision, date of issue) as on the controlled copy.
 */
export const IT_FORM_KINDS = ["incident_repair", "it_request", "credentials", "maintenance"] as const;
export type ItFormKind = (typeof IT_FORM_KINDS)[number];

export const FORM_DOCUMENT: Record<ItFormKind, { formatNo: string; revision: string; issued: string }> = {
  incident_repair: { formatNo: "APPLUS/IT/03", revision: "01", issued: "9-07-2024" },
  it_request: { formatNo: "APPLUS/IT/05", revision: "02", issued: "04-05-2025" },
  credentials: { formatNo: "APPLUS/ITM/12", revision: "01", issued: "11-05-2023" },
  maintenance: { formatNo: "APPLUS/ITM/08", revision: "00", issued: "04-06-2023" },
};

const text = (max = 300) => z.string().trim().max(max).default("");
const flag = z.boolean().default(false);
const level = z.enum(["", "low", "medium", "high"]).default("");
export const LEVELS = ["low", "medium", "high"] as const;

/** Who the form is about, as the employee directory has them (and as IT corrects it on the form). */
const person = z.object({
  name: text(150),
  empId: text(40),
  department: text(150),
  branch: text(100),
  jobTitle: text(150),
  email: text(200),
  mobile: text(40),
});

// ------------------------------------------------------------- IT Incident / Repair (APPLUS/IT/03)

export const incidentRepairData = z.object({
  person: person.default(person.parse({})),
  dateReported: text(20),
  incident: z
    .object({ on: flag, severity: level, description: text(1000), diagnosis: text(1000), resolution: text(1000) })
    .default({ on: false, severity: "", description: "", diagnosis: "", resolution: "" }),
  repair: z
    .object({
      on: flag,
      severity: level,
      category: text(),
      brand: text(),
      model: text(),
      serial: text(),
      diskType: text(40),
      diskSize: text(40),
      ram: text(40),
      processor: text(80),
      screen: text(40),
      others: text(1000),
      diagnosis: text(1000),
      resolution: text(1000),
    })
    .default({ on: false, severity: "", category: "", brand: "", model: "", serial: "", diskType: "", diskSize: "", ram: "", processor: "", screen: "", others: "", diagnosis: "", resolution: "" }),
  remarks: text(1000),
});

// ------------------------------------------------------- IT Services & ERP request (APPLUS/IT/05)

export const EQUIPMENT = ["desktop", "laptop", "lcdMonitor", "doorAccess", "ipPhone", "printer", "simCard", "scanner"] as const;
export const CARTRIDGES = ["black", "color"] as const;
export const TONERS = ["black", "cyan", "magenta", "yellow"] as const;
export const REQUEST_REASONS = ["notIssued", "outdated", "damaged", "unrepairable", "lost", "new", "replenish"] as const;
export const FOLDER_PERMISSIONS = ["full", "readWrite", "readOnly"] as const;
export const OASIS_REQUEST_TYPES = ["disablePrivileges", "addPrivileges", "disableUser", "reactivateUser"] as const;

type Privilege = { key: string; label: string };
type Grid = { key: string; rows: string[]; cols: string[] };
/** A module of the OASIS system: all of it, or the privileges named under it. */
export type OasisModule = { key: string; label: string; items: Privilege[]; grids?: Grid[]; after?: Privilege[] };
const p = (key: string, label: string): Privilege => ({ key, label });

/** The OASIS privileges as the request form lists them, section by section. */
export const OASIS: { key: string; label: string; modules: OasisModule[] }[] = [
  {
    key: "system",
    label: "System",
    modules: [
      { key: "masterTable", label: "Master Table", items: [p("readOnly", "Master Table Read only")] },
      {
        key: "customerServices",
        label: "Customer Services",
        items: [p("requests", "Request Management"), p("closed", "View Closed Requests"), p("delete", "Delete Requests"), p("deleted", "Show Deleted Requests"), p("reports", "Reports")],
      },
      { key: "clientRegistry", label: "Client Registry - Administrator", items: [p("deactivate", "Deactivate Clients")] },
      {
        key: "businessDevelopment",
        label: "Business Development",
        items: [
          p("prospects", "Prospect Registry"),
          p("salesLead", "Sales Lead"),
          p("underwriting", "Underwriting Department"),
          p("prospectReports", "Prospect Reports"),
          p("allSales", "Access All Users Sales"),
          p("allProducers", "Access All Producers"),
          p("allBranches", "Access All Branch"),
        ],
      },
      { key: "fms", label: "Financial Management System", items: [] },
      { key: "fmsPrivileges", label: "Financial Management System (Privileges)", items: [] },
      { key: "pendingSettlement", label: "Show Pending Settlement", items: [] },
      { key: "clientApprovalAlert", label: "Show Client Approval Alert", items: [] },
      { key: "expiredPoliciesAlert", label: "Show Expired Policies Alert", items: [] },
      { key: "duePayments", label: "Show Due Payments", items: [] },
      { key: "leadPoliciesAlert", label: "Show Lead Current Policies Alert", items: [] },
      { key: "systemAdmin", label: "System Admin", items: [p("userAccounts", "User Account Management"), p("sms", "SMS Control Panel")] },
    ],
  },
  {
    key: "production",
    label: "Production",
    modules: [
      {
        key: "production",
        label: "Production",
        items: [p("clientApproval", "Client Creation Approval"), p("report", "Production Report"), p("underwriting", "Underwriting"), p("activeInactive", "Active / Inactive")],
        grids: [{ key: "lines", rows: ["View", "Entry", "Entry Approval", "Delete Approval"], cols: ["General", "Medical", "Motor"] }],
        after: [p("commissionProducers", "View Commission: Producers"), p("commissionCompany", "View Commission: Company"), p("deleteRecords", "Delete Records Registry")],
      },
    ],
  },
  {
    key: "finance",
    label: "Financial Management System",
    modules: [
      {
        key: "chartOfAccounts",
        label: "Chart of Accounts",
        items: [p("management", "Chart of Accounts Management"), p("rename", "Rename Accounts"), p("approval", "Account Creation Approval Client Accounts"), p("insurers", "Approve Insurance Companies Profile Creation")],
      },
      {
        key: "makeNew",
        label: "Make New",
        items: [p("journal", "Journal Voucher"), p("receipt", "Receipt Voucher"), p("pay", "Pay Voucher"), p("reverse", "Reverse Voucher"), p("clientAcct", "Client Acct")],
      },
      { key: "archives", label: "Archives", items: [p("receipt", "Receipt Voucher"), p("debit", "Debit Notes"), p("pay", "Pay Voucher"), p("credit", "Credit notes")] },
      { key: "reports", label: "Reports", items: [p("trialBalance", "Trial Balance"), p("profitLoss", "Profit Loss"), p("ia", "IA Reports"), p("statement", "Statement of Accounts")] },
      {
        key: "approvals",
        label: "Approvals",
        items: [
          p("journal", "Journal Voucher"),
          p("receipt", "Receipt Voucher"),
          p("pay", "Pay Voucher"),
          p("production", "Production Entry"),
          p("payroll", "Payroll Voucher"),
          p("productionSor", "Production Entry (SOR)"),
          p("claims", "Claims Payments"),
          p("commission", "Monthly Accrued Commission"),
          p("settings", "Settings"),
          p("dataLock", "Data Lock"),
          p("accounts", "Disable / Enable Accounts"),
          p("reconciliation", "Accounting Reconciliation"),
          p("emailStatement", "Email Statement of Accounts"),
        ],
      },
    ],
  },
  {
    key: "claims",
    label: "Claims",
    modules: [
      {
        key: "claims",
        label: "Claims management System",
        items: [
          p("management", "Claim Management"),
          p("clientApproval", "Clients Creation Approval"),
          p("managerApproval", "Claims Manager Approval"),
          p("exportMedical", "Export Medical List"),
          p("reports", "Reports"),
          p("followUp", "Claims Follow Up"),
          p("reactivate", "Re-activate Claims"),
          p("deleteApproval", "Delete Claims (Approval Level)"),
          p("deleteCorrection", "Delete Claims (Correction Level)"),
        ],
        grids: [{ key: "lines", rows: ["View", "Entry"], cols: ["General", "Medical", "Motor"] }],
      },
    ],
  },
  {
    key: "hr",
    label: "Human Resources",
    modules: [
      {
        key: "hr",
        label: "HR Management System",
        items: [
          p("staffProfile", "Staff Profile"),
          p("reminder", "HR Reminder"),
          p("warning", "Warning Letter"),
          p("absence", "Absence"),
          p("vacation", "Vacation Management"),
          p("appraisal", "Appraisal Form"),
          p("vacationManager", "Vacation Approval (Dept Manager)"),
          p("vacationHr", "Vacation Approval (HR)"),
          p("letters", "Form Letters"),
          p("incidents", "Incidents"),
          p("overtime", "HR Overtime"),
          p("jobOffers", "Job Offer Management"),
          p("overtimeApproval", "HR Overtime Approval"),
          p("overtimeManager", "HR Overtime Approval (Dept Manager)"),
          p("payroll", "Payroll"),
          p("settings", "Settings"),
        ],
      },
    ],
  },
];

/** The key a privilege is kept under: section.module (all of it), section.module.item, or a grid cell. */
export const privilegeKey = (section: string, module: string, item?: string) => [section, module, item].filter(Boolean).join(".");
export const gridKey = (section: string, module: string, grid: string, row: string, col: string) =>
  privilegeKey(section, module, `${grid}:${row}:${col}`.toLowerCase().replace(/\s+/g, "_"));

/** Every privilege key the form knows, for checking what is saved. */
export const OASIS_KEYS = new Set(
  OASIS.flatMap((s) =>
    s.modules.flatMap((m) => [
      privilegeKey(s.key, m.key),
      ...m.items.map((i) => privilegeKey(s.key, m.key, i.key)),
      ...(m.after ?? []).map((i) => privilegeKey(s.key, m.key, i.key)),
      ...(m.grids ?? []).flatMap((g) => g.rows.flatMap((r) => g.cols.map((c) => gridKey(s.key, m.key, g.key, r, c)))),
    ]),
  ),
);

const folder = z.object({ names: text(), permission: z.enum(["", ...FOLDER_PERMISSIONS]).default("") });

export const itRequestData = z.object({
  person: person.default(person.parse({})),
  it: z
    .object({
      on: flag,
      equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).default([]),
      notesComputer: text(),
      notesMonitor: text(),
      notesPhone: text(),
      notesSim: text(),
      others: text(),
      cartridges: z.array(z.enum(CARTRIDGES)).default([]),
      toners: z.array(z.enum(TONERS)).default([]),
      reasons: z.array(z.enum(REQUEST_REASONS)).default([]),
      folders: z.array(folder).max(2).default([]),
    })
    .default({ on: false, equipment: [], notesComputer: "", notesMonitor: "", notesPhone: "", notesSim: "", others: "", cartridges: [], toners: [], reasons: [], folders: [] }),
  oasis: z
    .object({
      on: flag,
      user: z.enum(["", "new", "existing"]).default(""),
      oasisId: text(40),
      requestType: z.array(z.enum(OASIS_REQUEST_TYPES)).default([]),
      reason: text(500),
      privileges: z
        .array(z.string())
        .max(OASIS_KEYS.size)
        .default([])
        .refine((keys) => keys.every((k) => OASIS_KEYS.has(k)), { message: "Unknown privilege" }),
    })
    .default({ on: false, user: "", oasisId: "", requestType: [], reason: "", privileges: [] }),
});

// ------------------------------------------------- Employee Credential Information (APPLUS/ITM/12)

export const CREDENTIAL_ITEMS = ["laptop", "pc", "idCard", "accessCard", "screen"] as const;

/** No passwords: the sheet gives the names to sign in with, never what to sign in with. */
export const credentialsData = z.object({
  person: person.default(person.parse({})),
  emailId: text(200),
  oasisId: text(80),
  outlookUrl: text(300),
  ticketingUrl: text(300),
  items: z.array(z.enum(CREDENTIAL_ITEMS)).default([]),
  others: text(),
  signedBy: text(150),
});

// --------------------------------------------------- Scheduled Maintenance Report (APPLUS/ITM/08)

export const MAINTENANCE_TASKS = [
  "Clean keyboard, mouse, and computer unit using compressed air",
  "Inspect computer parts for damage (assign action for repair/replacement)",
  "Organize the cables and look for signs of wear and tear",
  "Clear out browser files",
  "Configure startup programs",
  "Update the operating system",
  "Run Update the anti-virus & Run a full scan",
  "Defragment the hard drive",
  "Empty the recycle bin",
  "Reboot the computer system",
  "Run disk cleanup/Storage.",
  "Uninstall unused programs.",
  "Make a backup copy of all critical data.",
  "Check that you have enough free disk space.",
  "Check all PC cables are correctly plugged in securely.",
  "Remove dust from all fans.",
  "Use canned air to blow away the accumulated dirt and dust.",
  "Clean Screen.",
  "Update drivers as needed.",
] as const;
export const TASK_STATES = ["done", "issue", "na"] as const;

export const maintenanceData = z.object({
  person: person.default(person.parse({})),
  date: text(20),
  assetType: z.enum(["", "laptop", "pc"]).default(""),
  manufacturer: text(),
  tasks: z
    .array(z.enum(["", ...TASK_STATES]))
    .length(MAINTENANCE_TASKS.length)
    .default(MAINTENANCE_TASKS.map(() => "" as const)),
  issues: text(2000),
  checkedBy: text(150),
  checkedDate: text(20),
});

export const IT_FORM_DATA = {
  incident_repair: incidentRepairData,
  it_request: itRequestData,
  credentials: credentialsData,
  maintenance: maintenanceData,
} as const;

export type ItFormData<K extends ItFormKind> = z.output<(typeof IT_FORM_DATA)[K]>;

/** A form as saved: which form, who it is about, the asset it concerns, and what was filled in. */
export const itFormInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("incident_repair"), employeeId: z.number().int().positive().nullish(), assetId: z.number().int().positive().nullish(), data: incidentRepairData }),
  z.object({ kind: z.literal("it_request"), employeeId: z.number().int().positive().nullish(), assetId: z.number().int().positive().nullish(), data: itRequestData }),
  z.object({ kind: z.literal("credentials"), employeeId: z.number().int().positive().nullish(), assetId: z.number().int().positive().nullish(), data: credentialsData }),
  z.object({ kind: z.literal("maintenance"), employeeId: z.number().int().positive().nullish(), assetId: z.number().int().positive().nullish(), data: maintenanceData }),
]);
export type ItFormInput = z.infer<typeof itFormInput>;

/** An empty form of a kind, every field at its default. */
export const emptyFormData = <K extends ItFormKind>(kind: K) => IT_FORM_DATA[kind].parse({}) as ItFormData<K>;

/** "20-Oct-2025", as the paper forms write dates. */
export function formDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]}-${months[Number(m[2]) - 1]}-${m[1]}`;
}
