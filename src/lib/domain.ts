/**
 * Fixed values the business logic depends on. Labels live in the message files under `enums`.
 * Values an admin may extend (locations, issue types, categories...) are reference lists instead.
 */

export const TICKET_TYPES = ["incident", "request"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "on_hold", "resolved", "closed"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const CSAT_SCORES = [1, 2, 3, 4, 5] as const;

export const ASSET_STATUSES = ["in_use", "in_stock", "in_repair", "retired"] as const;
export const SUPPORT_STATUSES = ["supported", "ending_soon", "end_of_support", "end_of_life", "unknown"] as const;
export const CRITICALITIES = ["low", "medium", "high", "critical"] as const;
export const MONITOR_METHODS = ["none", "ping", "tcp"] as const;
export const DEVICE_STATUSES = ["up", "degraded", "down", "unknown"] as const;
export const ALERT_KINDS = ["down", "degraded"] as const;
export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const;

/** `source <type> target`: an ERP app runs_on its server, which depends_on the core switch. */
export const RELATION_TYPES = ["depends_on", "runs_on", "connects_to", "backs_up"] as const;

export const LICENSE_TYPES = ["subscription", "perpetual", "oem", "volume"] as const;
export const VENDOR_STATUSES = ["active", "inactive"] as const;
export const PURCHASE_STATUSES = ["requested", "approved", "rejected", "ordered", "received"] as const;

export const KB_STATUSES = ["draft", "published", "retired"] as const;
export const CHANGE_STATUSES = ["requested", "approved", "rejected", "implemented"] as const;
export const CHANGE_RESULTS = ["successful", "rolled_back", "failed"] as const;
export const CHANGE_RISKS = ["low", "medium", "high"] as const;

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export const RISK_STATUSES = ["open", "mitigating", "accepted", "closed"] as const;
export const VULN_STATUSES = ["open", "in_progress", "resolved", "accepted"] as const;
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export const LOOKUP_LISTS = [
  "location",
  "department",
  "issue_type",
  "asset_category",
  "asset_type",
  "manufacturer",
  "kb_category",
  "vendor_category",
  "budget_category",
  "risk_category",
] as const;

/** The workbook's new-joiner checklist (IT_New_Joinee), in its three phases. */
export const ONBOARDING_TASKS = [
  { key: "create_email", phase: "preparation" },
  { key: "create_accounts", phase: "preparation" },
  { key: "folder_permissions", phase: "preparation" },
  { key: "prepare_device", phase: "preparation" },
  { key: "access_card", phase: "preparation" },
  { key: "check_accounts", phase: "during" },
  { key: "deliver_device", phase: "during" },
  { key: "deliver_cards", phase: "during" },
  { key: "it_policies", phase: "during" },
  { key: "check_shares", phase: "after" },
  { key: "signed_forms", phase: "after" },
] as const;
export const ONBOARDING_PHASES = ["preparation", "during", "after"] as const;

/** The workbook's offboarding tracker: mail forwards for 90 days, then the mailbox goes. */
export const OFFBOARDING_TASKS = [
  "disable_account",
  "forward_mail",
  "collect_device",
  "revoke_access",
  "archive_mailbox",
  "delete_mailbox",
] as const;
export const FORWARDING_DAYS = 90;

/** The workbook's Daily Monitoring checks. */
export const DAILY_CHECKS = [
  "domain_controller",
  "exchange",
  "backup_server",
  "erp_server",
  "nas_storage",
  "file_shares",
  "pbx",
  "security_monitoring",
  "internet_links",
  "data_center_cooling",
  "ups",
  "switches",
  "wifi",
  "test_email",
  "printers",
] as const;

export const KPI_KEYS = ["tat", "complaints", "training_hours", "iso_ncs", "satisfaction"] as const;
/** KPIs entered by hand each quarter; the rest are computed from tickets. */
export const MANUAL_KPIS = ["training_hours", "iso_ncs"] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type Criticality = (typeof CRITICALITIES)[number];
export type MonitorMethod = (typeof MONITOR_METHODS)[number];
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type RelationType = (typeof RELATION_TYPES)[number];
export type LicenseType = (typeof LICENSE_TYPES)[number];
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export type KbStatus = (typeof KB_STATUSES)[number];
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RiskStatus = (typeof RISK_STATUSES)[number];
export type VulnStatus = (typeof VULN_STATUSES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type LookupList = (typeof LOOKUP_LISTS)[number];
export type KpiKey = (typeof KPI_KEYS)[number];
export type OnboardingTask = (typeof ONBOARDING_TASKS)[number]["key"];
export type OffboardingTask = (typeof OFFBOARDING_TASKS)[number];
export type DailyCheck = (typeof DAILY_CHECKS)[number];

/** Display references in the workbook's style: IT000351, AST-0142, LIC-001. */
export const REF_PREFIX = {
  ticket: ["IT", 6, ""],
  asset: ["AST", 4, "-"],
  license: ["LIC", 3, "-"],
  change: ["CHG", 3, "-"],
  risk: ["RSK", 3, "-"],
  vulnerability: ["VULN", 3, "-"],
  article: ["KB", 3, "-"],
  project: ["PRJ", 3, "-"],
  purchase: ["PR", 3, "-"],
  contract: ["CON", 3, "-"],
} as const;

export function ref(kind: keyof typeof REF_PREFIX, id: number): string {
  const [prefix, width, sep] = REF_PREFIX[kind];
  return `${prefix}${sep}${String(id).padStart(width, "0")}`;
}
