import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type {
  AssetStatus,
  AttachmentEntity,
  AttachmentKind,
  ChangeStatus,
  Criticality,
  DeviceStatus,
  EmailKind,
  EmailStatus,
  KbStatus,
  LicenseType,
  LookupList,
  MonitorMethod,
  Priority,
  ProjectStatus,
  PurchaseStatus,
  RelationType,
  RiskStatus,
  Severity,
  SupportStatus,
  TaskStatus,
  TicketStatus,
  TicketType,
  VulnStatus,
} from "@/lib/domain";

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = () => numeric({ precision: 14, scale: 2, mode: "number" });
const day = () => date({ mode: "string" });

// ---------------------------------------------------------------- system

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

/** Admin-editable reference lists, labelled in both languages. Records store the code. */
export const lookups = pgTable(
  "lookups",
  {
    id: id(),
    list: text().$type<LookupList>().notNull(),
    code: text().notNull(),
    labelEn: text().notNull(),
    labelAr: text().notNull(),
    sortOrder: integer().notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.list, t.code)],
);

/** Append-only record of every change. No endpoint updates or deletes it. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    userId: text(),
    userName: text().notNull(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
  },
  (t) => [index().on(t.at)],
);

// ---------------------------------------------------------------- people and accounts

/** The company directory: requesters, asset holders, joiners and leavers. Not everyone signs in. */
export const employees = pgTable("employees", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  department: text().notNull(),
  location: text().notNull(),
  jobTitle: text().notNull(),
  /** The company ID number printed on the ID card. Not unique: old lists hold duplicates to correct. */
  employeeNumber: text(),
  phone: text(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Better Auth tables (email and password, admin plugin). Field names follow Better Auth's models.
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: text().notNull().default("employee"),
  banned: boolean().default(false),
  banReason: text(),
  banExpires: timestamp({ withTimezone: true }),
  employeeId: integer().references(() => employees.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  ipAddress: text(),
  userAgent: text(),
  impersonatedBy: text(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accounts = pgTable("accounts", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verifications = pgTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const joiners = pgTable("joiners", {
  id: id(),
  name: text().notNull(),
  email: text().notNull(),
  department: text().notNull(),
  location: text().notNull(),
  jobTitle: text().notNull(),
  employeeNumber: text(),
  startDate: day().notNull(),
  tasks: jsonb().$type<Record<string, boolean>>().notNull().default({}),
  employeeId: integer().references(() => employees.id, { onDelete: "set null" }),
  completedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const leavers = pgTable("leavers", {
  id: id(),
  employeeId: integer()
    .notNull()
    .references(() => employees.id),
  resignationDate: day().notNull(),
  forwardTo: text(),
  tasks: jsonb().$type<Record<string, boolean>>().notNull().default({}),
  notes: text(),
  completedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- assets and CMDB

export const assets = pgTable(
  "assets",
  {
    id: id(),
    name: text().notNull(),
    category: text().notNull(),
    type: text().notNull(),
    manufacturer: text(),
    model: text(),
    serial: text(),
    status: text().$type<AssetStatus>().notNull().default("in_stock"),
    location: text().notNull(),
    assignedTo: integer().references(() => employees.id, { onDelete: "set null" }),
    purchaseId: integer().references(() => purchases.id, { onDelete: "set null" }),
    purchaseDate: day(),
    purchaseCost: money(),
    warrantyEnd: day(),
    supportStatus: text().$type<SupportStatus>().notNull().default("supported"),
    criticality: text().$type<Criticality>().notNull().default("medium"),
    ipAddress: text(),
    macAddress: text(),
    os: text(),
    notes: text(),
    monitorMethod: text().$type<MonitorMethod>().notNull().default("none"),
    monitorPort: integer(),
    monitorStatus: text().$type<DeviceStatus>().notNull().default("unknown"),
    monitorLatencyMs: integer(),
    monitorFailures: smallint().notNull().default(0),
    monitorCheckedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.assignedTo), index().on(t.category)],
);

export const assetMovements = pgTable("asset_movements", {
  id: id(),
  assetId: integer()
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  fromLocation: text(),
  toLocation: text().notNull(),
  fromEmployeeId: integer().references(() => employees.id, { onDelete: "set null" }),
  toEmployeeId: integer().references(() => employees.id, { onDelete: "set null" }),
  reason: text().notNull(),
  movedBy: text().notNull(),
  movedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const relationships = pgTable(
  "relationships",
  {
    id: id(),
    sourceId: integer()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    targetId: integer()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: text().$type<RelationType>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.sourceId, t.targetId, t.type)],
);

// ---------------------------------------------------------------- service desk

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    type: text().$type<TicketType>().notNull(),
    status: text().$type<TicketStatus>().notNull().default("open"),
    priority: text().$type<Priority>().notNull().default("medium"),
    issueType: text().notNull(),
    location: text().notNull(),
    subject: text().notNull(),
    description: text().notNull(),
    requesterId: integer()
      .notNull()
      .references(() => employees.id),
    assigneeId: text().references(() => users.id, { onDelete: "set null" }),
    assetId: integer().references(() => assets.id, { onDelete: "set null" }),
    dueAt: timestamp({ withTimezone: true }).notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    resolution: text(),
    satisfaction: smallint(),
    reopenCount: smallint().notNull().default(0),
    createdBy: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status), index().on(t.requesterId), index().on(t.createdAt)],
);

export const ticketComments = pgTable("ticket_comments", {
  id: id(),
  ticketId: integer()
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorId: text().references(() => users.id, { onDelete: "set null" }),
  authorName: text().notNull(),
  body: text().notNull(),
  createdAt: createdAt(),
});

export const kbArticles = pgTable("kb_articles", {
  id: id(),
  title: text().notNull(),
  category: text().notNull(),
  issueType: text(),
  symptoms: text().notNull(),
  cause: text(),
  resolution: text().notNull(),
  status: text().$type<KbStatus>().notNull().default("draft"),
  reviewDue: day(),
  authorId: text().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const changes = pgTable("changes", {
  id: id(),
  title: text().notNull(),
  assetId: integer().references(() => assets.id, { onDelete: "set null" }),
  description: text().notNull(),
  reason: text().notNull(),
  risk: text().$type<"low" | "medium" | "high">().notNull(),
  rollbackPlan: text().notNull(),
  plannedAt: timestamp({ withTimezone: true }).notNull(),
  status: text().$type<ChangeStatus>().notNull().default("requested"),
  result: text().$type<"successful" | "rolled_back" | "failed">(),
  vendor: text(),
  ticketId: integer().references(() => tickets.id, { onDelete: "set null" }),
  requestedBy: text().references(() => users.id, { onDelete: "set null" }),
  approvedBy: text().references(() => users.id, { onDelete: "set null" }),
  implementedAt: timestamp({ withTimezone: true }),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- software and finance

export const vendors = pgTable("vendors", {
  id: id(),
  name: text().notNull(),
  category: text().notNull(),
  contactName: text(),
  email: text(),
  phone: text(),
  website: text(),
  active: boolean().notNull().default(true),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const licenses = pgTable("licenses", {
  id: id(),
  product: text().notNull(),
  vendorId: integer().references(() => vendors.id, { onDelete: "set null" }),
  version: text(),
  type: text().$type<LicenseType>().notNull(),
  seats: integer().notNull(),
  purchaseDate: day(),
  expiryDate: day(),
  cost: money(),
  owner: text(),
  /** A reference to where the key is kept, never the key itself. */
  reference: text(),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const licenseInstalls = pgTable(
  "license_installs",
  {
    id: id(),
    licenseId: integer()
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    assetId: integer()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.licenseId, t.assetId)],
);

export const contracts = pgTable("contracts", {
  id: id(),
  title: text().notNull(),
  vendorId: integer().references(() => vendors.id, { onDelete: "set null" }),
  category: text().notNull(),
  location: text(),
  startDate: day().notNull(),
  endDate: day().notNull(),
  annualCost: money().notNull(),
  autoRenew: boolean().notNull().default(false),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const purchases = pgTable("purchases", {
  id: id(),
  title: text().notNull(),
  category: text().notNull(),
  vendorId: integer().references(() => vendors.id, { onDelete: "set null" }),
  requestedFor: integer().references(() => employees.id, { onDelete: "set null" }),
  quantity: integer().notNull().default(1),
  amount: money().notNull(),
  status: text().$type<PurchaseStatus>().notNull().default("requested"),
  hardware: boolean().notNull().default(false),
  requestedBy: text().references(() => users.id, { onDelete: "set null" }),
  approvedBy: text().references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp({ withTimezone: true }),
  orderedAt: timestamp({ withTimezone: true }),
  receivedAt: timestamp({ withTimezone: true }),
  notes: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    fiscalYear: integer().notNull(),
    category: text().notNull(),
    amount: money().notNull(),
  },
  (t) => [unique().on(t.fiscalYear, t.category)],
);

// ---------------------------------------------------------------- projects

export const projects = pgTable("projects", {
  id: id(),
  name: text().notNull(),
  description: text(),
  ownerId: text().references(() => users.id, { onDelete: "set null" }),
  status: text().$type<ProjectStatus>().notNull().default("planned"),
  startDate: day(),
  dueDate: day(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectTasks = pgTable("project_tasks", {
  id: id(),
  projectId: integer()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text().notNull(),
  assigneeId: text().references(() => users.id, { onDelete: "set null" }),
  status: text().$type<TaskStatus>().notNull().default("todo"),
  dueDate: day(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- risk and security

export const risks = pgTable("risks", {
  id: id(),
  title: text().notNull(),
  category: text().notNull(),
  assetId: integer().references(() => assets.id, { onDelete: "set null" }),
  description: text().notNull(),
  controls: text(),
  likelihood: smallint().notNull(),
  impact: smallint().notNull(),
  treatment: text(),
  ownerId: text().references(() => users.id, { onDelete: "set null" }),
  status: text().$type<RiskStatus>().notNull().default("open"),
  reviewDate: day(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vulnerabilities = pgTable("vulnerabilities", {
  id: id(),
  title: text().notNull(),
  severity: text().$type<Severity>().notNull(),
  assetId: integer().references(() => assets.id, { onDelete: "set null" }),
  description: text(),
  detectedOn: day().notNull(),
  detectionMethod: text(),
  status: text().$type<VulnStatus>().notNull().default("open"),
  deadline: day().notNull(),
  resolvedOn: day(),
  resolution: text(),
  ownerId: text().references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- monitoring and discovery

export const monitorChecks = pgTable(
  "monitor_checks",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    assetId: integer()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    up: boolean().notNull(),
    latencyMs: integer(),
  },
  (t) => [index().on(t.assetId, t.checkedAt)],
);

export const alerts = pgTable("alerts", {
  id: id(),
  assetId: integer()
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  kind: text().$type<"down" | "degraded">().notNull(),
  status: text().$type<"open" | "acknowledged" | "resolved">().notNull().default("open"),
  openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: text().references(() => users.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp({ withTimezone: true }),
  resolvedAt: timestamp({ withTimezone: true }),
  ticketId: integer().references(() => tickets.id, { onDelete: "set null" }),
});

export const discoveryRuns = pgTable("discovery_runs", {
  id: id(),
  cidr: text().notNull(),
  status: text().$type<"running" | "done" | "failed">().notNull().default("running"),
  total: integer().notNull(),
  scanned: integer().notNull().default(0),
  error: text(),
  startedBy: text().references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
});

export const discoveryHosts = pgTable("discovery_hosts", {
  id: id(),
  runId: integer()
    .notNull()
    .references(() => discoveryRuns.id, { onDelete: "cascade" }),
  ip: text().notNull(),
  hostname: text(),
  mac: text(),
  openPorts: integer().array().notNull().default([]),
  latencyMs: integer(),
});

export const dailyChecks = pgTable(
  "daily_checks",
  {
    id: id(),
    date: day().notNull(),
    item: text().notNull(),
    done: boolean().notNull().default(false),
    note: text(),
    checkedBy: text().references(() => users.id, { onDelete: "set null" }),
    checkedByName: text(),
    checkedAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.date, t.item)],
);

// ---------------------------------------------------------------- KPIs

/** Quarterly figures entered by hand; the other KPIs are computed from tickets. */
export const kpiActuals = pgTable(
  "kpi_actuals",
  {
    id: id(),
    year: integer().notNull(),
    quarter: smallint().notNull(),
    kpi: text().notNull(),
    value: numeric({ precision: 10, scale: 2, mode: "number" }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.year, t.quarter, t.kpi)],
);

// ---------------------------------------------------------------- email

/** Every email the app sends, kept as an outbox: what went, to whom, and whether it arrived at the mail server. */
export const emails = pgTable(
  "emails",
  {
    id: id(),
    kind: text().$type<EmailKind>().notNull(),
    recipient: text().notNull(),
    subject: text().notNull(),
    html: text().notNull(),
    text: text().notNull(),
    status: text().$type<EmailStatus>().notNull().default("pending"),
    attempts: smallint().notNull().default(0),
    error: text(),
    ticketId: integer().references(() => tickets.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastAttemptAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.status), index().on(t.createdAt)],
);

/**
 * A link in an email that acts without signing in. Only a hash of its token is stored, so the
 * table cannot be used to forge one. Each works once, for one person and one ticket, until it expires.
 */
export const emailLinks = pgTable("email_links", {
  id: id(),
  tokenHash: text().notNull().unique(),
  kind: text().$type<"resolution">().notNull(),
  ticketId: integer()
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  employeeId: integer()
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  usedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- files

/**
 * A document attached to an asset, purchase or contract. The file itself is on disk under
 * UPLOADS_DIR, at `storageKey`, a random name; the name shown is the one it was uploaded with.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    entity: text().$type<AttachmentEntity>().notNull(),
    entityId: integer().notNull(),
    kind: text().$type<AttachmentKind>().notNull(),
    name: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    storageKey: text().notNull().unique(),
    uploadedBy: text().references(() => users.id, { onDelete: "set null" }),
    uploadedByName: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entity, t.entityId)],
);
