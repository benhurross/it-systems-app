import { z } from "zod";
import {
  ASSET_STATUSES,
  CHANGE_RESULTS,
  CHANGE_RISKS,
  CHANGE_STATUSES,
  CRITICALITIES,
  CSAT_SCORES,
  DAILY_CHECKS,
  KB_STATUSES,
  LICENSE_TYPES,
  LOOKUP_LISTS,
  MANUAL_KPIS,
  MONITOR_METHODS,
  PRIORITIES,
  PROJECT_STATUSES,
  PURCHASE_STATUSES,
  RELATION_TYPES,
  RISK_STATUSES,
  SEVERITIES,
  SMTP_SECURITY,
  SUPPORT_STATUSES,
  TASK_STATUSES,
  TICKET_STATUSES,
  TICKET_TYPES,
  VULN_STATUSES,
} from "./domain";
import { ROLES } from "./permissions";

// Shared field shapes. Optional fields arrive as null (or are left out) and are stored as null.
const name = z.string().trim().min(1).max(200);
const body = z.string().trim().min(1).max(10_000);
const optionalText = z.string().trim().max(10_000).nullish().transform((v) => v || null);
const day = z.iso.date();
const optionalDay = z.iso.date().nullish().transform((v) => v ?? null);
const id = z.number().int().positive();
const optionalId = id.nullish().transform((v) => v ?? null);
const optionalUser = z.string().min(1).nullish().transform((v) => v ?? null);
const amount = z.number().nonnegative().max(1e11);
const code = z.string().trim().min(1).max(60);

export const ticketCreate = z.object({
  type: z.enum(TICKET_TYPES),
  subject: name,
  description: body,
  issueType: code,
  location: code,
  priority: z.enum(PRIORITIES).default("medium"),
  requesterId: optionalId,
  assigneeId: optionalUser,
  assetId: optionalId,
});

export const ticketUpdate = z
  .object({
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(PRIORITIES),
    issueType: code,
    assigneeId: optionalUser,
    assetId: optionalId,
    resolution: optionalText,
    satisfaction: z.union(CSAT_SCORES.map((s) => z.literal(s))).nullish(),
  })
  .partial()
  .refine((t) => t.status !== "resolved" || !!t.resolution, {
    message: "validation.resolutionRequired",
    path: ["resolution"],
  });

export const commentCreate = z.object({ body });

export const kbArticle = z.object({
  title: name,
  category: code,
  issueType: code.nullish().transform((v) => v ?? null),
  symptoms: body,
  cause: optionalText,
  resolution: body,
  status: z.enum(KB_STATUSES),
  reviewDue: optionalDay,
});

export const changeInput = z.object({
  title: name,
  assetId: optionalId,
  description: body,
  reason: body,
  risk: z.enum(CHANGE_RISKS),
  rollbackPlan: body,
  plannedAt: z.iso.datetime({ offset: true }),
  vendor: optionalText,
  ticketId: optionalId,
  notes: optionalText,
});

export const changeDecision = z
  .object({ status: z.enum(CHANGE_STATUSES), result: z.enum(CHANGE_RESULTS).nullish() })
  .refine((c) => c.status !== "implemented" || !!c.result, { message: "validation.resultRequired", path: ["result"] });

export const assetInput = z.object({
  name,
  category: code,
  type: code,
  manufacturer: code.nullish().transform((v) => v ?? null),
  model: optionalText,
  serial: optionalText,
  status: z.enum(ASSET_STATUSES),
  location: code,
  assignedTo: optionalId,
  purchaseId: optionalId,
  purchaseDate: optionalDay,
  purchaseCost: amount.nullish().transform((v) => v ?? null),
  warrantyEnd: optionalDay,
  supportStatus: z.enum(SUPPORT_STATUSES),
  criticality: z.enum(CRITICALITIES),
  ipAddress: z.ipv4().nullish().transform((v) => v ?? null),
  macAddress: optionalText,
  os: optionalText,
  notes: optionalText,
  monitorMethod: z.enum(MONITOR_METHODS),
  monitorPort: z.number().int().min(1).max(65_535).nullish().transform((v) => v ?? null),
})
  .refine((a) => a.monitorMethod === "none" || a.ipAddress !== null, { message: "validation.ipRequired", path: ["ipAddress"] })
  .refine((a) => a.monitorMethod !== "tcp" || a.monitorPort !== null, { message: "validation.portRequired", path: ["monitorPort"] });

export const assetMove = z.object({
  toLocation: code,
  toEmployeeId: optionalId,
  reason: name,
});

export const relationshipInput = z
  .object({ sourceId: id, targetId: id, type: z.enum(RELATION_TYPES) })
  .refine((r) => r.sourceId !== r.targetId, { message: "validation.selfRelation", path: ["targetId"] });

export const licenseInput = z.object({
  product: name,
  vendorId: optionalId,
  version: optionalText,
  type: z.enum(LICENSE_TYPES),
  seats: z.number().int().min(0).max(1_000_000),
  purchaseDate: optionalDay,
  expiryDate: optionalDay,
  cost: amount.nullish().transform((v) => v ?? null),
  owner: code.nullish().transform((v) => v ?? null),
  reference: optionalText,
  notes: optionalText,
});

export const licenseInstall = z.object({ assetId: id });

export const vendorInput = z.object({
  name,
  category: code,
  contactName: optionalText,
  email: z.email().nullish().transform((v) => v ?? null),
  phone: optionalText,
  website: z.url().nullish().transform((v) => v ?? null),
  active: z.boolean(),
  notes: optionalText,
});

export const contractInput = z
  .object({
    title: name,
    vendorId: optionalId,
    category: code,
    location: code.nullish().transform((v) => v ?? null),
    startDate: day,
    endDate: day,
    annualCost: amount,
    autoRenew: z.boolean(),
    notes: optionalText,
  })
  .refine((c) => c.endDate >= c.startDate, { message: "validation.endBeforeStart", path: ["endDate"] });

export const purchaseInput = z.object({
  title: name,
  category: code,
  vendorId: optionalId,
  requestedFor: optionalId,
  quantity: z.number().int().min(1).max(10_000),
  amount,
  hardware: z.boolean(),
  notes: optionalText,
});

export const purchaseStatus = z.object({ status: z.enum(PURCHASE_STATUSES) });

export const budgetInput = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  category: code,
  amount,
});

export const projectInput = z.object({
  name,
  description: optionalText,
  ownerId: optionalUser,
  status: z.enum(PROJECT_STATUSES),
  startDate: optionalDay,
  dueDate: optionalDay,
});

export const taskInput = z.object({
  title: name,
  assigneeId: optionalUser,
  status: z.enum(TASK_STATUSES),
  dueDate: optionalDay,
});

const score = z.number().int().min(1).max(5);

export const riskInput = z.object({
  title: name,
  category: code,
  assetId: optionalId,
  description: body,
  controls: optionalText,
  likelihood: score,
  impact: score,
  treatment: optionalText,
  ownerId: optionalUser,
  status: z.enum(RISK_STATUSES),
  reviewDate: optionalDay,
});

export const vulnerabilityInput = z.object({
  title: name,
  severity: z.enum(SEVERITIES),
  assetId: optionalId,
  description: optionalText,
  detectedOn: day,
  detectionMethod: optionalText,
  status: z.enum(VULN_STATUSES),
  deadline: day,
  resolution: optionalText,
  ownerId: optionalUser,
});

export const employeeInput = z.object({
  name,
  email: z.email(),
  department: code,
  location: code,
  jobTitle: name,
  phone: optionalText,
  active: z.boolean(),
});

export const joinerInput = z.object({
  name,
  email: z.email(),
  department: code,
  location: code,
  jobTitle: name,
  startDate: day,
});

export const leaverInput = z.object({
  employeeId: id,
  resignationDate: day,
  forwardTo: z.email().nullish().transform((v) => v ?? null),
  notes: optionalText,
});

export const checklistUpdate = z.object({ tasks: z.record(z.string(), z.boolean()) });

export const dailyCheckInput = z.object({
  date: day,
  item: z.enum(DAILY_CHECKS),
  done: z.boolean(),
  note: optionalText,
});

export const discoveryStart = z.object({ cidr: z.string().trim().min(1).max(40) });

export const lookupInput = z.object({
  list: z.enum(LOOKUP_LISTS),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "validation.codeFormat")
    .max(60),
  labelEn: name,
  labelAr: name,
  sortOrder: z.number().int().min(0).max(10_000),
  active: z.boolean(),
});

const hours = z.number().positive().max(24 * 90);
export const slaSettings = z.object({ critical: hours, high: hours, medium: hours, low: hours });

/** Resolved tickets the requester has not answered close by themselves after this many days. */
export const ticketSettings = z.object({ autoCloseDays: z.number().int().min(1).max(30) });

/** A requester's answer to "is it fixed?", from the link in the resolution email. */
export const respondInput = z.discriminatedUnion("answer", [
  z.object({ answer: z.literal("fixed"), rating: z.union(CSAT_SCORES.map((s) => z.literal(s))).nullish() }),
  z.object({ answer: z.literal("not_fixed"), reason: body }),
]);

export const monitorSettings = z.object({
  enabled: z.boolean(),
  intervalSeconds: z.number().int().min(15).max(3600),
  timeoutMs: z.number().int().min(250).max(10_000),
  degradedMs: z.number().int().min(10).max(10_000),
  retentionDays: z.number().int().min(1).max(365),
});

/**
 * How the app reaches the mail server. The password is write-only: left blank, the saved one is kept.
 * Turning sending on needs a server, a sender address and the address links in emails open.
 */
export const emailSettings = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(200),
    port: z.number().int().min(1).max(65_535),
    security: z.enum(SMTP_SECURITY),
    username: z.string().trim().max(200),
    password: z.string().max(200).optional(),
    fromName: z.string().trim().max(100),
    fromAddress: z.union([z.literal(""), z.email()]),
    appUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).transform((v) => v.replace(/\/+$/, "")),
    allowInvalidCert: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.enabled) return;
    for (const field of ["host", "fromAddress", "appUrl"] as const) {
      if (!v[field]) ctx.addIssue({ code: "custom", path: [field], message: "validation.required" });
    }
  });

/** The address a test email goes to. */
export const emailTestInput = z.object({ to: z.email() });

export const organisationSettings = z.object({
  name,
  fiscalYearStartMonth: z.number().int().min(1).max(12),
});

const kpiTarget = z.object({ baseline: z.number().min(0), target: z.number().min(0) });
/** A year's quarterly figures for a KPI entered by hand; null clears a quarter. */
export const kpiActualsInput = z.object({
  year: z.number().int().min(2000).max(2100),
  kpi: z.enum(MANUAL_KPIS),
  quarters: z.array(z.number().min(0).max(1_000_000).nullable()).length(4),
});

export const kpiTargetsInput = z.object({
  year: z.number().int().min(2000).max(2100),
  targets: z.object({
    tat: kpiTarget,
    complaints: kpiTarget,
    training_hours: kpiTarget,
    iso_ncs: kpiTarget,
    satisfaction: kpiTarget,
  }),
});

const password = z.string().min(10).max(128);

export const userCreate = z
  .object({
    name,
    email: z.email(),
    role: z.enum(ROLES),
    employeeId: optionalId,
    password,
  })
  .refine((u) => u.role !== "employee" || u.employeeId !== null, {
    message: "validation.employeeRequired",
    path: ["employeeId"],
  });

export const userUpdate = z
  .object({
    role: z.enum(ROLES),
    employeeId: id.nullable(),
    active: z.boolean(),
    password: password.nullish(),
  })
  .partial();
