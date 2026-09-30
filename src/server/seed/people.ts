import type { Role } from "@/lib/permissions";
import { PLACEHOLDER_DOMAIN } from "@/lib/people";
import { REFERENCE } from "./reference";

/**
 * Reads a staff list exported from a spreadsheet (a header row, then one row per person) into
 * employees the demo seed can use in place of invented ones. Gaps are filled with defaults the
 * owner can correct later in the app, and every change is reported rather than made silently.
 */

export type Person = {
  name: string;
  email: string;
  department: string;
  location: string;
  jobTitle: string;
  phone: string | null;
  active: boolean;
  /** The account to create for them; null for no account. */
  role: Role | null;
  /** True when the sheet had no usable email and a placeholder was made up. */
  placeholderEmail: boolean;
};

type Cell = string | number | boolean | Date | null | undefined | object;

/** The largest department, for rows that name none or one the app does not know. */
export const DEFAULT_DEPARTMENT = "operations";
export const DEFAULT_LOCATION = "jeddah";
export const DEFAULT_JOB_TITLE = "Employee";
export { PLACEHOLDER_DOMAIN };

/** Header spellings each field accepts, compared without case, spaces or punctuation. */
const COLUMNS = {
  name: ["fullname", "name", "employeename"],
  first: ["firstname", "givenname"],
  last: ["lastname", "surname", "familyname"],
  email: ["email", "emailaddress", "mail"],
  department: ["department", "dept"],
  location: ["location", "office", "branch"],
  jobTitle: ["designation", "jobtitle", "title", "position"],
  phone: ["phone", "mobile", "extension", "ext"],
  role: ["role", "accountrole", "access"],
  active: ["active", "status"],
} as const;
type Field = keyof typeof COLUMNS;

/** Department names the sheet may use for a list entry under another label. */
const DEPARTMENT_ALIASES: Record<string, string> = {
  "finance and accounting": "finance",
  accounting: "finance",
  "information technology": "it",
  management: "executive",
};

/** Misspellings seen in job titles, fixed as whole words. */
const MISSPELLINGS: Record<string, string> = {
  consultan: "Consultant",
  developement: "Development",
  mnager: "Manager",
  complince: "Compliance",
  specilty: "Specialty",
  reconcilation: "Reconciliation",
};

const ROLE_NAMES: Record<string, Role> = {
  admin: "admin",
  administrator: "admin",
  itstaff: "it_staff",
  it: "it_staff",
  staff: "it_staff",
  employee: "employee",
};

const YES = new Set(["yes", "y", "true", "1", "active"]);
const NO = new Set(["no", "n", "false", "0", "inactive", "resigned", "left"]);

const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (text: string) =>
  text.toLowerCase().replaceAll("&", " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function text(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).replace(/\s+/g, " ").trim();
}

/** Matches a sheet value to a reference list by code, English or Arabic label, with or without "Department". */
function lookupMatcher(entries: [string, string, string][], aliases: Record<string, string> = {}) {
  const index = new Map<string, string>(Object.entries(aliases));
  for (const [code, en, ar] of entries) for (const name of [code, en, ar]) index.set(words(name), code);
  return (value: string) => {
    const w = words(value);
    return index.get(w) ?? index.get(w.replace(/ (department|dept|branch|office)$/, "")) ?? null;
  };
}

function tidyTitle(title: string) {
  const fixed = title
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim()
    .replace(/\p{L}+/gu, (word) => MISSPELLINGS[word.toLowerCase()] ?? word);
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function cleanPeople(sheet: Cell[][]): { people: Person[]; notes: string[] } {
  const [header = [], ...rows] = sheet;
  const column = Object.fromEntries(
    (Object.keys(COLUMNS) as Field[]).map((field) => [
      field,
      header.findIndex((h) => (COLUMNS[field] as readonly string[]).includes(key(text(h)))),
    ]),
  ) as Record<Field, number>;
  if (column.name < 0 && column.first < 0) throw new Error("The sheet needs a Full Name column, or FirstName and LastName columns.");
  if (column.department < 0) throw new Error("The sheet needs a Department column.");

  const department = lookupMatcher(REFERENCE.department, DEPARTMENT_ALIASES);
  const location = lookupMatcher(REFERENCE.location);
  const people: Person[] = [];
  const notes: string[] = [];
  const emails = new Map<string, string>();

  rows.forEach((row, i) => {
    const line = i + 2;
    const get = (field: Field) => (column[field] < 0 ? "" : text(row[column[field]]));
    if (row.every((cell) => text(cell) === "")) return;

    const name = get("name") || [get("first"), get("last")].filter(Boolean).join(" ");
    if (!name) return void notes.push(`Row ${line}: skipped, no name.`);

    const given = get("email").toLowerCase();
    if (given && isEmail(given) && emails.has(given)) {
      return void notes.push(`Row ${line}: skipped ${name}, ${given} already belongs to ${emails.get(given)}.`);
    }
    const placeholderEmail = !isEmail(given);
    let email = given;
    if (placeholderEmail) {
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "employee";
      email = `${base}@${PLACEHOLDER_DOMAIN}`;
      for (let n = 2; emails.has(email); n++) email = `${base}.${n}@${PLACEHOLDER_DOMAIN}`;
      notes.push(`${name}: ${given ? `"${given}" is not an email address` : "no email"}, so ${email} is used.`);
    }
    emails.set(email, name);

    const deptValue = get("department");
    let dept = deptValue ? department(deptValue) : null;
    if (!dept) {
      notes.push(`${name}: ${deptValue ? `department "${deptValue}" is not in the list` : "no department"}, so ${DEFAULT_DEPARTMENT} is used.`);
      dept = DEFAULT_DEPARTMENT;
    }

    const locValue = get("location");
    let loc = locValue ? location(locValue) : DEFAULT_LOCATION;
    if (!loc) {
      notes.push(`${name}: location "${locValue}" is not in the list, so ${DEFAULT_LOCATION} is used.`);
      loc = DEFAULT_LOCATION;
    }

    const rawTitle = get("jobTitle");
    let jobTitle = tidyTitle(rawTitle);
    if (!jobTitle) {
      notes.push(`${name}: no job title, so "${DEFAULT_JOB_TITLE}" is used.`);
      jobTitle = DEFAULT_JOB_TITLE;
    } else if (jobTitle !== rawTitle) {
      notes.push(`${name}: job title "${rawTitle}" becomes "${jobTitle}".`);
    }

    const activeValue = key(get("active"));
    let active = true;
    if (NO.has(activeValue)) active = false;
    else if (column.active >= 0 && !YES.has(activeValue)) notes.push(`${name}: active is ${activeValue ? `"${get("active")}"` : "blank"}, so they are counted as active.`);

    const roleValue = get("role");
    let role: Role | null = roleValue ? (ROLE_NAMES[key(roleValue)] ?? null) : null;
    if (roleValue && !role) notes.push(`${name}: role "${roleValue}" is not admin, IT staff or employee, so no account is made.`);
    if (role && !active) {
      notes.push(`${name}: no account, because they are inactive.`);
      role = null;
    }
    if (role && placeholderEmail) {
      notes.push(`${name}: no account, because they have no email.`);
      role = null;
    }

    people.push({ name, email, department: dept, location: loc, jobTitle, phone: get("phone") || null, active, role, placeholderEmail });
  });

  const byName = new Map<string, Person[]>();
  for (const p of people) byName.set(p.name.toLowerCase(), [...(byName.get(p.name.toLowerCase()) ?? []), p]);
  for (const same of byName.values()) {
    if (same.length > 1) notes.push(`${same[0].name} appears ${same.length} times: ${same.map((p) => p.email).join(", ")}.`);
  }
  return { people, notes };
}
