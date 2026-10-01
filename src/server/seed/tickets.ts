import { randomBytes } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { ref, type TicketStatus, type TicketType } from "@/lib/domain";
import { PLACEHOLDER_DOMAIN } from "@/lib/people";
import { dueAt } from "@/lib/sla";
import { db } from "../db";
import * as s from "../db/schema";
import { auth } from "../auth";
import { getSetting } from "../settings";
import { DEFAULT_DEPARTMENT, DEFAULT_JOB_TITLE, DEFAULT_LOCATION } from "./people";

// Loads the IT ticket log (an export from the old system, as a spreadsheet) in place of the tickets
// in the database. Ticket numbers are kept, so IT001234 stays IT001234.

type Cell = string | number | boolean | Date | null | undefined | object;
type Lookup = { code: string; labelEn: string };

/** One row of the log, cleaned. Times are instants; the log's are wall-clock times in Riyadh. */
export type LoggedTicket = {
  number: number;
  openedAt: Date;
  closedAt: Date | null;
  status: TicketStatus;
  type: TicketType;
  issueType: string;
  location: string;
  requester: string;
  subject: string;
  /** How the request reached IT, as a code from the "channel" list, when the log says. */
  channel: string | null;
  closedBy: string | null;
  /** Reopened after it was first closed, and when, as the log's Reopened columns say. */
  reopened: boolean;
  reopenedAt: Date | null;
};

const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v)).replace(/\s+/g, " ").trim();

const COLUMNS = {
  number: ["ticketno", "ticketnumber", "ticket", "ref"],
  opened: ["openeddate", "opened", "createddate", "date"],
  location: ["location", "branch"],
  issueType: ["issuetype", "category", "type"],
  requester: ["user", "requester", "employee", "name"],
  description: ["description", "subject", "issue"],
  status: ["status"],
  closed: ["closeddate", "closed"],
  closedBy: ["closedby", "resolvedby", "technician"],
  channel: ["channel", "source", "via", "receivedvia", "receivedby"],
  reopened: ["reopened"],
  reopenedAt: ["reopeneddate", "reopenedon"],
} as const;

const RIYADH = 3 * 3_600_000;
/** A wall-clock time in Riyadh (UTC+3, no daylight saving) as an instant. */
const riyadh = (y: number, month: number, d: number, h = 0, mi = 0, sec = 0) => new Date(Date.UTC(y, month - 1, d, h, mi, sec) - RIYADH);

/** "15/02/2024 10:46:37", "25/04/2024" or "2024-02-15 10:46": day first, as the log writes them. */
function textDate(v: string): Date | null {
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (dmy) return riyadh(+dmy[3], +dmy[2], +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (iso) return riyadh(+iso[1], +iso[2], +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0));
  return null;
}

/**
 * A date cell. The reader gives the cell's wall-clock time in the UTC fields. Opened in Excel
 * with US settings, a log written day first has its dates read month first wherever the day was
 * 12 or less (the rest stay text); `swapped` puts day and month back.
 */
function cellDate(v: Date, swapped: boolean): Date {
  const d = new Date(Math.round(v.getTime() / 1000) * 1000);
  const [month, day] = swapped ? [d.getUTCDate(), d.getUTCMonth() + 1] : [d.getUTCMonth() + 1, d.getUTCDate()];
  return riyadh(d.getUTCFullYear(), month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

const toDate = (v: Cell, swapped: boolean) => (v instanceof Date ? cellDate(v, swapped) : textDate(text(v)));

const STATUSES: Record<string, TicketStatus> = {
  closed: "closed",
  resolved: "resolved",
  open: "open",
  new: "open",
  inprogress: "in_progress",
  onhold: "on_hold",
  pending: "on_hold",
};

/** "WhatsApp" however it was typed, and the rest tidied. */
function channelOf(v: string): string | null {
  if (!v) return null;
  const k = key(v);
  if (/^w[ah]+t+s?[ae]*p+$/.test(k) || k === "whatsapp") return "WhatsApp";
  if (k === "phone" || k === "call" || k === "telephone") return "Phone";
  if (k === "emailalert") return "Email alert";
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

/** The list entry a value names, by code or English label, ignoring "issues" and "request". */
function lookupOf(value: string, list: Lookup[]): string | null {
  const plain = value.toLowerCase().replace(/\b(issues?|requests?|problems?)\b/g, " ").trim().replace(/\s+/g, "_");
  for (const l of list) if (l.code === plain || key(l.labelEn) === key(value) || key(l.labelEn) === key(plain)) return l.code;
  for (const l of list) if (plain && (key(l.labelEn).startsWith(key(plain)) || l.code.startsWith(plain))) return l.code;
  return null;
}

/**
 * Reads the log's first sheet: a header row naming the columns, then one ticket per row. Rows
 * without a ticket number or an opening date are skipped; everything else that needed a guess is
 * listed in the notes.
 */
export function cleanTickets(sheet: Cell[][], lists: { location: Lookup[]; issue_type: Lookup[]; channel: Lookup[] }) {
  const notes: string[] = [];
  const headerAt = sheet.findIndex((row) => row.some((c) => COLUMNS.number.includes(key(text(c)) as never)));
  if (headerAt < 0) throw new Error("No header row with a TicketNo column.");
  const header = sheet[headerAt].map((c) => key(text(c)));
  const at = Object.fromEntries(
    Object.entries(COLUMNS).map(([field, names]) => [field, header.findIndex((h) => (names as readonly string[]).includes(h))]),
  ) as Record<keyof typeof COLUMNS, number>;
  // The log keeps how a request came in under a column with no name.
  if (at.channel < 0) {
    const unnamed = header.findIndex((h, i) => h === "" && sheet.slice(headerAt + 1).some((r) => text(r[i]) !== ""));
    at.channel = unnamed;
  }
  const rows = sheet.slice(headerAt + 1).filter((r) => text(r[at.number]) !== "");

  // Whether date cells were read month first: the reading that keeps tickets in number order wins.
  const numberOf = (r: Cell[]) => Number(/(\d+)\s*$/.exec(text(r[at.number]))?.[1] ?? NaN);
  const ordered = rows.filter((r) => !Number.isNaN(numberOf(r))).sort((a, b) => numberOf(a) - numberOf(b));
  const outOfOrder = (swapped: boolean) => {
    let n = 0;
    let last = -Infinity;
    for (const r of ordered) {
      const t = toDate(r[at.opened], swapped)?.getTime();
      if (t === undefined) continue;
      if (t < last) n++;
      last = t;
    }
    return n;
  };
  const swapped = outOfOrder(true) < outOfOrder(false);
  const dateCells = rows.filter((r) => r[at.opened] instanceof Date || r[at.closed] instanceof Date).length;
  if (swapped) notes.push(`${dateCells} rows had dates Excel read month first; day and month were put back.`);

  const seen = new Set<number>();
  const tickets: LoggedTicket[] = [];
  for (const r of rows) {
    const label = text(r[at.number]);
    const number = numberOf(r);
    if (Number.isNaN(number) || number <= 0) {
      notes.push(`Skipped "${label}": not a ticket number.`);
      continue;
    }
    if (seen.has(number)) {
      notes.push(`Skipped a second ${ref("ticket", number)}.`);
      continue;
    }
    const openedAt = toDate(r[at.opened], swapped);
    if (!openedAt) {
      notes.push(`Skipped ${ref("ticket", number)}: no opening date.`);
      continue;
    }
    seen.add(number);

    const rawStatus = text(r[at.status]);
    let closedAt = at.closed >= 0 ? toDate(r[at.closed], swapped) : null;
    let status = STATUSES[key(rawStatus)];
    if (!status) {
      status = closedAt ? "closed" : "open";
      notes.push(`${ref("ticket", number)}: status "${rawStatus}" is not one the app has, so it is ${status}.`);
    }
    const finished = status === "closed" || status === "resolved";
    if (finished && !closedAt) {
      closedAt = openedAt;
      notes.push(`${ref("ticket", number)}: ${status} with no closing date, so it closes when it opened.`);
    }
    if (!finished) closedAt = null;
    if (closedAt && closedAt < openedAt) {
      notes.push(`${ref("ticket", number)}: closed (${closedAt.toISOString().slice(0, 10)}) before it opened (${openedAt.toISOString().slice(0, 10)}), so it closes when it opened.`);
      closedAt = openedAt;
    }

    const rawIssue = text(r[at.issueType]);
    let issueType = lookupOf(rawIssue, lists.issue_type);
    if (!issueType) {
      issueType = "other";
      notes.push(`${ref("ticket", number)}: issue type "${rawIssue}" is not in the list, so it is "other".`);
    }
    const rawLocation = text(r[at.location]);
    let location = lookupOf(rawLocation, lists.location);
    if (!location) {
      location = lists.location[0]?.code ?? "jeddah";
      notes.push(`${ref("ticket", number)}: location "${rawLocation}" is not in the list, so it is ${location}.`);
    }
    const description = text(r[at.description]);
    const rawChannel = at.channel >= 0 ? channelOf(text(r[at.channel])) : null;
    const channel = rawChannel ? lookupOf(rawChannel, lists.channel) : null;
    if (rawChannel && !channel) notes.push(`${ref("ticket", number)}: received by "${rawChannel}" is not in the list, so it is not recorded.`);
    const reopenedAt = at.reopenedAt >= 0 ? toDate(r[at.reopenedAt], swapped) : null;
    const reopenedText = at.reopened >= 0 ? key(text(r[at.reopened])) : "";
    tickets.push({
      number,
      openedAt,
      closedAt,
      status,
      // Problems ("... Issues") are incidents; maintenance and other requests are requests.
      type: /\bissues?\b|\bproblems?\b/i.test(rawIssue) ? "incident" : "request",
      issueType,
      location,
      requester: text(r[at.requester]) || "Unknown",
      subject: (description || rawIssue || "Ticket").slice(0, 200),
      channel,
      closedBy: finished && at.closedBy >= 0 ? text(r[at.closedBy]) || null : null,
      reopened: reopenedAt !== null || !["", "no", "n", "false", "0"].includes(reopenedText),
      reopenedAt,
    });
  }
  tickets.sort((a, b) => a.number - b.number);
  return { tickets, notes };
}

// ---------------------------------------------------------------- who is who

/** A name as compared: lowercase letters only, "Al Saleh" and "Al-Saleh" both "alsaleh". */
export function normalName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]+/g, " ")
    .replace(/\b(al|el)\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

export type Requester =
  | { kind: "exact" | "close"; id: number; name: string }
  | { kind: "team"; name: string }
  | { kind: "unknown"; name: string };

/**
 * Who a name in the log is in the directory: the same name, or close to it (middle names left out,
 * or one letter different). A shared mailbox ("Finance Finance", "Sales Team") becomes a team.
 */
export function matchRequester(name: string, people: { id: number; name: string }[]): Requester {
  const n = normalName(name);
  const words = n.split(" ");
  const exact = people.find((p) => normalName(p.name) === n);
  if (exact) return { kind: "exact", id: exact.id, name: exact.name };

  const subset = (a: string[], b: string[]) => a.length >= 2 && a[0] === b[0] && a.at(-1) === b.at(-1) && a.every((w) => b.includes(w));
  const close = people.filter((p) => {
    const other = normalName(p.name);
    const theirs = other.split(" ");
    return subset(words, theirs) || subset(theirs, words) || (n.length >= 8 && distance(n, other) <= 1);
  });
  if (close.length === 1) return { kind: "close", id: close[0].id, name: close[0].name };

  if (words.length === 1 || words.at(-1) === "team" || words.every((w) => w === words[0])) {
    const first = name.trim().split(/\s+/)[0];
    const team = `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()} team`;
    // Loaded before: the team is in the directory already.
    const known = people.find((p) => normalName(p.name) === normalName(team));
    return known ? { kind: "exact", id: known.id, name: known.name } : { kind: "team", name: team };
  }
  return { kind: "unknown", name: name.trim() };
}

/**
 * The IT account a "closed by" value names: the same name, the only one with that first name, or
 * the one whose email it is ("Helpdesk" for helpdesk@...).
 */
export function matchStaff(value: string, staff: { id: string; name: string; email: string }[]) {
  const k = normalName(value);
  const sorted = [...staff].sort((a, b) => a.email.localeCompare(b.email));
  // One person may have two accounts; a first name naming only them is still them.
  const byFirst = sorted.filter((u) => normalName(u.name).split(" ")[0] === k);
  return (
    sorted.find((u) => normalName(u.name) === k) ??
    (byFirst.length > 0 && byFirst.every((u) => normalName(u.name) === normalName(byFirst[0].name)) ? byFirst[0] : undefined) ??
    sorted.find((u) => u.email.split("@")[0].toLowerCase() === value.toLowerCase().replace(/\s+/g, ""))
  );
}

// ---------------------------------------------------------------- the People sheet

/**
 * A row of the optional People sheet, saying who a name in the log is: someone already in the
 * directory (by name or email), or someone to add with these details. A row whose Account is
 * "IT staff" or "Admin" also gets a sign-in, for a name in the Closed by column.
 */
export type PersonFix = {
  inLog: string;
  name: string;
  email: string | null;
  department: string | null;
  jobTitle: string | null;
  location: string | null;
  employeeNumber: string | null;
  status: "current" | "left" | "mailbox";
  account: "it_staff" | "admin" | null;
};

const PEOPLE_COLUMNS = {
  inLog: ["nameinlog", "inlog", "logname"],
  name: ["name", "fullname"],
  email: ["email"],
  department: ["department"],
  jobTitle: ["jobtitle", "designation", "title"],
  location: ["location"],
  employeeNumber: ["idnumber", "empid", "employeenumber"],
  status: ["status"],
  account: ["account", "role"],
} as const;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function cleanPeopleSheet(sheet: Cell[][], lists: { department: Lookup[]; location: Lookup[] }) {
  const notes: string[] = [];
  const header = (sheet[0] ?? []).map((c) => key(text(c)));
  const at = Object.fromEntries(
    Object.entries(PEOPLE_COLUMNS).map(([field, names]) => [field, header.findIndex((h) => (names as readonly string[]).includes(h))]),
  ) as Record<keyof typeof PEOPLE_COLUMNS, number>;
  const get = (r: Cell[], field: keyof typeof PEOPLE_COLUMNS) => (at[field] >= 0 ? text(r[at[field]]) : "");
  const fixes: PersonFix[] = [];
  for (const r of sheet.slice(1)) {
    const inLog = get(r, "inLog") || get(r, "name");
    if (!inLog) continue;
    const name = get(r, "name") || inLog;
    let email: string | null = get(r, "email").toLowerCase() || null;
    if (email && !isEmail(email)) {
      notes.push(`People: "${email}" for ${name} is not an email address, so none is used.`);
      email = null;
    }
    const lookup = (field: "department" | "location") => {
      const value = get(r, field);
      if (!value) return null;
      const code = lookupOf(value, lists[field]);
      if (!code) notes.push(`People: ${field} "${value}" for ${name} is not in the list, so the default is used.`);
      return code;
    };
    const status = key(get(r, "status"));
    const account = key(get(r, "account"));
    fixes.push({
      inLog,
      name,
      email,
      department: lookup("department"),
      jobTitle: get(r, "jobTitle") || null,
      location: lookup("location"),
      employeeNumber: get(r, "employeeNumber") || null,
      status: status.startsWith("left") || status === "inactive" || status === "resigned" ? "left" : status.includes("mailbox") || status === "team" ? "mailbox" : "current",
      account: account === "admin" ? "admin" : account.includes("it") || account === "staff" ? "it_staff" : null,
    });
  }
  return { fixes, notes };
}

// ---------------------------------------------------------------- loading

const CHUNK = 500;

type Person = { id: number; name: string; email: string };
type Staff = { id: string; name: string; email: string };

/** Someone the People sheet names, found in the directory by email or name. */
const findPerson = (fix: PersonFix, people: Person[]) =>
  people.find((p) => (fix.email && p.email.toLowerCase() === fix.email) || normalName(p.name) === normalName(fix.name));

/**
 * Matches the log's people and IT staff against the database and, when `replace` is set, removes
 * every ticket there (with its comments, links and history) and loads the log's in their place.
 * Without it, only reports what would happen. The People sheet, when given, decides who names in
 * the log are before any guessing.
 */
export async function importTickets(tickets: LoggedTicket[], { replace, people: fixes = [] }: { replace: boolean; people?: PersonFix[] }) {
  const [people, staffUsers, [{ n: existing }], sla] = await Promise.all([
    db.select({ id: s.employees.id, name: s.employees.name, email: s.employees.email }).from(s.employees),
    db.select({ id: s.users.id, name: s.users.name, email: s.users.email }).from(s.users).where(inArray(s.users.role, ["admin", "it_staff"])),
    db.select({ n: sql<number>`count(*)::int` }).from(s.tickets),
    getSetting("sla"),
  ]);
  const fixFor = new Map(fixes.map((f) => [normalName(f.inLog), f]));

  // Who each requester is: the People sheet first, then the directory, then a guess.
  type Resolved = Requester | { kind: "listed"; id: number; name: string } | { kind: "new"; fix: PersonFix };
  const requesters = new Map<string, Resolved>();
  for (const t of tickets) {
    if (requesters.has(t.requester)) continue;
    const fix = fixFor.get(normalName(t.requester));
    const found = fix && findPerson(fix, people);
    requesters.set(t.requester, fix ? (found ? { kind: "listed", id: found.id, name: found.name } : { kind: "new", fix }) : matchRequester(t.requester, people));
  }

  // Who closed each ticket: an account the People sheet names (made if it says so), or a match.
  const accountsToMake = new Map<string, PersonFix>();
  const closers = new Map<string, Staff | null>();
  for (const t of tickets) {
    if (!t.closedBy || closers.has(t.closedBy)) continue;
    const fix = fixFor.get(normalName(t.closedBy));
    const user = fix
      ? staffUsers.find((u) => (fix.email && u.email.toLowerCase() === fix.email) || normalName(u.name) === normalName(fix.name))
      : matchStaff(t.closedBy, staffUsers);
    if (!user && fix?.account && fix.email) accountsToMake.set(t.closedBy, fix);
    closers.set(t.closedBy, user ?? null);
  }

  const count = (pick: (t: LoggedTicket) => boolean) => tickets.filter(pick).length;
  const ticketsOf = (from: string) => count((t) => t.requester === from);
  const report = {
    tickets: tickets.length,
    existing,
    first: tickets[0]?.openedAt ?? null,
    last: tickets.at(-1)?.openedAt ?? null,
    exact: count((t) => requesters.get(t.requester)!.kind === "exact"),
    close: [...requesters].filter(([, r]) => r.kind === "close" || r.kind === "listed").map(([from, r]) => ({ from, to: (r as { name: string }).name, tickets: ticketsOf(from) })),
    // People added to the directory: from the People sheet, as teams, or as unknown people who left.
    added: [] as { name: string; kind: "listed" | "team" | "unknown"; status: PersonFix["status"]; from: string[]; tickets: number }[],
    closers: [...closers].map(([from, user]) => ({
      from,
      to: user?.name ?? (accountsToMake.has(from) ? `${accountsToMake.get(from)!.name} (new account)` : null),
      tickets: count((t) => t.closedBy === from),
    })),
    accounts: [] as { name: string; email: string; role: string; password: string }[],
    reopened: count((t) => t.reopened),
    channels: Object.entries(Object.groupBy(tickets, (t) => t.channel ?? "")).map(([channel, list]) => ({ channel: channel || null, tickets: list!.length })),
  };
  const added = new Map<string, (typeof report.added)[number] & { fix?: PersonFix }>();
  for (const [from, r] of requesters) {
    if (r.kind !== "new" && r.kind !== "team" && r.kind !== "unknown") continue;
    const name = r.kind === "new" ? r.fix.name : r.name;
    const entry = added.get(name) ?? {
      name,
      kind: r.kind === "new" ? ("listed" as const) : r.kind,
      status: r.kind === "new" ? r.fix.status : r.kind === "team" ? ("mailbox" as const) : ("left" as const),
      fix: r.kind === "new" ? r.fix : undefined,
      from: [],
      tickets: 0,
    };
    entry.from.push(from);
    entry.tickets += ticketsOf(from);
    added.set(name, entry);
  }
  // A new account's person is added too, if the directory does not have them yet.
  for (const fix of accountsToMake.values()) {
    if (!added.has(fix.name) && !findPerson(fix, people)) added.set(fix.name, { name: fix.name, kind: "listed", status: fix.status, fix, from: [], tickets: 0 });
  }
  report.added = [...added.values()].sort((a, b) => b.tickets - a.tickets).map(({ name, kind, status, from, tickets: n }) => ({ name, kind, status, from, tickets: n }));
  if (!replace) return report;

  // People first, then accounts (made through sign-in, outside the database transaction).
  const emails = new Set(people.map((p) => p.email.toLowerCase()));
  const ids = new Map<string, number>();
  for (const entry of added.values()) {
    const fix = entry.fix;
    let email = fix?.email && !emails.has(fix.email) ? fix.email : null;
    if (!email) {
      const base = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "requester";
      email = `${base}@${PLACEHOLDER_DOMAIN}`;
      for (let n = 2; emails.has(email); n++) email = `${base}.${n}@${PLACEHOLDER_DOMAIN}`;
    }
    emails.add(email);
    const theirs = tickets.filter((t) => entry.from.includes(t.requester));
    const common = Object.entries(Object.groupBy(theirs, (t) => t.location)).sort((a, b) => b[1]!.length - a[1]!.length)[0]?.[0];
    const [row] = await db
      .insert(s.employees)
      .values({
        name: entry.name,
        email,
        department: fix?.department ?? DEFAULT_DEPARTMENT,
        location: fix?.location ?? common ?? DEFAULT_LOCATION,
        jobTitle: fix?.jobTitle ?? (entry.status === "mailbox" ? "Shared mailbox" : entry.kind === "unknown" ? "Not on the staff list" : DEFAULT_JOB_TITLE),
        employeeNumber: fix?.employeeNumber ?? null,
        // A mailbox and someone still here are current; a name not on the staff list has most likely left.
        active: entry.status !== "left",
      })
      .returning({ id: s.employees.id });
    ids.set(entry.name, row.id);
  }
  for (const [from, fix] of accountsToMake) {
    const password = randomBytes(12).toString("base64url");
    const { user } = await auth.api.createUser({ body: { name: fix.name, email: fix.email!, password, role: fix.account! } });
    const employeeId = ids.get(fix.name) ?? findPerson(fix, people)?.id ?? null;
    if (employeeId) await db.update(s.users).set({ employeeId }).where(eq(s.users.id, user.id));
    closers.set(from, { id: user.id, name: fix.name, email: fix.email! });
    report.accounts.push({ name: fix.name, email: fix.email!, role: fix.account!, password });
  }
  const requesterId = (t: LoggedTicket) => {
    const r = requesters.get(t.requester)!;
    if (r.kind === "exact" || r.kind === "close" || r.kind === "listed") return r.id;
    return ids.get(r.kind === "new" ? r.fix.name : r.name)!;
  };

  await db.transaction(async (tx) => {
    // Old tickets' history would otherwise show on the log's tickets that take their numbers.
    await tx.delete(s.auditLog).where(sql`${s.auditLog.entity} = 'ticket'`);
    await tx.delete(s.tickets);

    for (let i = 0; i < tickets.length; i += CHUNK) {
      const chunk = tickets.slice(i, i + CHUNK);
      const rows = chunk.map((t) => {
        const assignee = t.closedBy ? (closers.get(t.closedBy)?.id ?? null) : null;
        const resolved = t.status === "closed" || t.status === "resolved" ? (t.closedAt?.toISOString() ?? null) : null;
        return sql`(${t.number}, ${t.type}, ${t.status}, 'medium', ${t.issueType}, ${t.location}, ${t.channel}, ${t.subject}, ${t.subject}, ${requesterId(t)}, ${assignee}, ${dueAt(t.openedAt, "medium", sla, t.issueType).toISOString()}, ${resolved}, ${t.status === "closed" ? resolved : null}, ${t.reopened ? 1 : 0}, ${t.openedAt.toISOString()}, ${(t.closedAt ?? t.openedAt).toISOString()})`;
      });
      await tx.execute(sql`
        INSERT INTO tickets (id, type, status, priority, issue_type, location, channel, subject, description, requester_id, assignee_id, due_at, resolved_at, closed_at, reopen_count, created_at, updated_at)
        OVERRIDING SYSTEM VALUE VALUES ${sql.join(rows, sql`, `)}`);

      // Each ticket's history: opened, reopened if it was, then closed by whoever closed it.
      const history = chunk.flatMap((t) => {
        const closer = t.closedBy ? closers.get(t.closedBy) : null;
        const entries: (typeof s.auditLog.$inferInsert)[] = [
          { at: t.openedAt, userName: "Ticket log", action: "create", entity: "ticket", entityId: String(t.number), summary: `Opened ${ref("ticket", t.number)}: ${t.subject} (from the ticket log)` },
        ];
        if (t.reopened && t.reopenedAt) {
          entries.push({ at: t.reopenedAt, userName: "Ticket log", action: "update", entity: "ticket", entityId: String(t.number), summary: `Updated ${ref("ticket", t.number)}: status open (reopened)` });
        }
        if (t.closedAt && t.status === "closed") {
          entries.push({ at: t.closedAt, userId: closer?.id ?? null, userName: closer?.name ?? t.closedBy ?? "Ticket log", action: "update", entity: "ticket", entityId: String(t.number), summary: `Updated ${ref("ticket", t.number)}: status closed` });
        }
        return entries;
      });
      await tx.insert(s.auditLog).values(history);
    }
    // New tickets carry on from the log's last number.
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('tickets', 'id'), GREATEST((SELECT max(id) FROM tickets), 1))`);
  });
  return report;
}
