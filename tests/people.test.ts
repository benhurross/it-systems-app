import { describe, expect, it, vi } from "vitest";

// The loader reads the reference lists, whose module also holds the seeding code and its connection.
vi.mock("@/server/db", () => ({ db: {} }));

const { cleanPeople, DEFAULT_DEPARTMENT, DEFAULT_JOB_TITLE, PLACEHOLDER_DOMAIN } = await import("@/server/seed/people");

const HEADER = ["EmpID", "FirstName", "lastName", "Designation", "Department", "Email", "Full Name", "Role", "active"];
type Row = { first?: string; last?: string; title?: string; dept?: string; email?: string; full?: string; role?: string; active?: string };
const sheet = (...rows: Row[]) => [
  HEADER,
  ...rows.map((r, i) => [1000 + i, r.first ?? null, r.last ?? null, r.title ?? null, r.dept ?? null, r.email ?? null, r.full ?? null, r.role ?? null, r.active ?? "YES"]),
];
const person = { title: "Accountant", dept: "Finance", email: "a.person@example.test", full: "Ada Person" };

describe("staff list loader", () => {
  it("reads a clean row as it is, with the default location and no account", () => {
    const { people, notes } = cleanPeople(sheet(person));
    expect(people).toEqual([
      {
        name: "Ada Person",
        email: "a.person@example.test",
        department: "finance",
        location: "jeddah",
        jobTitle: "Accountant",
        phone: null,
        active: true,
        role: null,
        placeholderEmail: false,
      },
    ]);
    expect(notes).toEqual([]);
  });

  it("finds columns under other spellings and orders, and builds the name from its parts", () => {
    const { people } = cleanPeople([
      ["E-mail", "Surname", "First Name", "Job Title", "DEPT", "Office", "Mobile", "Status"],
      ["B.Omar@Example.test ", "Omar", "Bilal", "Clerk", "sales", "Riyadh Branch", "0500", "no"],
    ]);
    expect(people[0]).toMatchObject({
      name: "Bilal Omar",
      email: "b.omar@example.test",
      department: "sales",
      location: "riyadh",
      jobTitle: "Clerk",
      phone: "0500",
      active: false,
    });
  });

  it("maps department names by code, label, Arabic label, alias and a trailing 'Department'", () => {
    const depts = ["IT", "Human Resources", "HR Department", "Finance and Accounting", "Finance & Accounting", "العمليات", "Executive Department"];
    const { people, notes } = cleanPeople(sheet(...depts.map((dept, i) => ({ ...person, dept, email: `p${i}@example.test`, full: `P${i}` }))));
    expect(people.map((p) => p.department)).toEqual(["it", "hr", "hr", "finance", "finance", "operations", "executive"]);
    expect(notes).toEqual([]);
  });

  it("uses the default department when it is missing or unknown, and says so", () => {
    const { people, notes } = cleanPeople(sheet({ ...person, dept: "" }, { ...person, dept: "Marketing", email: "b@example.test" }));
    expect(people.map((p) => p.department)).toEqual([DEFAULT_DEPARTMENT, DEFAULT_DEPARTMENT]);
    expect(notes).toEqual([
      `Ada Person: no department, so ${DEFAULT_DEPARTMENT} is used.`,
      `Ada Person: department "Marketing" is not in the list, so ${DEFAULT_DEPARTMENT} is used.`,
      "Ada Person appears 2 times: a.person@example.test, b@example.test.",
    ]);
  });

  it("falls back to Jeddah for an unknown location", () => {
    const { people, notes } = cleanPeople([["Name", "Department", "Location"], ["Ada Person", "IT", "Dammam"]]);
    expect(people[0].location).toBe("jeddah");
    expect(notes).toContain('Ada Person: location "Dammam" is not in the list, so jeddah is used.');
    expect(notes.join()).not.toMatch(/active/);
  });

  it("tidies job titles and fills a missing one", () => {
    const titles = ["“Senior claims officer", "Business developement Mnager", "Insurance Consultan", "Head of Specilty", ""];
    const { people, notes } = cleanPeople(sheet(...titles.map((title, i) => ({ ...person, title, email: `p${i}@example.test`, full: `P${i}` }))));
    expect(people.map((p) => p.jobTitle)).toEqual([
      "Senior claims officer",
      "Business Development Manager",
      "Insurance Consultant",
      "Head of Specialty",
      DEFAULT_JOB_TITLE,
    ]);
    expect(notes).toContain('P1: job title "Business developement Mnager" becomes "Business Development Manager".');
    expect(notes).toContain(`P4: no job title, so "${DEFAULT_JOB_TITLE}" is used.`);
  });

  it("makes unique placeholder emails for missing or invalid ones", () => {
    const { people, notes } = cleanPeople(
      sheet({ ...person, email: "" }, { ...person, email: "" }, { ...person, full: "Bo Li", email: "not an email" }),
    );
    expect(people.map((p) => [p.email, p.placeholderEmail])).toEqual([
      [`ada.person@${PLACEHOLDER_DOMAIN}`, true],
      [`ada.person.2@${PLACEHOLDER_DOMAIN}`, true],
      [`bo.li@${PLACEHOLDER_DOMAIN}`, true],
    ]);
    expect(notes).toContain(`Bo Li: "not an email" is not an email address, so bo.li@${PLACEHOLDER_DOMAIN} is used.`);
  });

  it("skips a row whose email is already taken, ignoring case", () => {
    const { people, notes } = cleanPeople(sheet(person, { ...person, full: "Ada Other", email: "A.Person@example.test" }));
    expect(people).toHaveLength(1);
    expect(notes).toEqual(["Row 3: skipped Ada Other, a.person@example.test already belongs to Ada Person."]);
  });

  it("reads the active column, treating a blank or unknown value as active", () => {
    const values = ["YES", "no", "Resigned", "", "maybe"];
    const { people, notes } = cleanPeople(sheet(...values.map((active, i) => ({ ...person, active, email: `p${i}@example.test`, full: `P${i}` }))));
    expect(people.map((p) => p.active)).toEqual([true, false, false, true, true]);
    expect(notes).toEqual(["P3: active is blank, so they are counted as active.", 'P4: active is "maybe", so they are counted as active.']);
  });

  it("gives accounts only to active people with a real email and a known role", () => {
    const rows: Row[] = [
      { ...person, full: "Admin One", email: "admin@example.test", role: "admin" },
      { ...person, full: "Staff One", email: "staff@example.test", role: "IT Staff" },
      { ...person, full: "Gone One", email: "gone@example.test", role: "admin", active: "NO" },
      { ...person, full: "No Mail", email: "", role: "admin" },
      { ...person, full: "Odd Role", email: "odd@example.test", role: "owner" },
    ];
    const { people, notes } = cleanPeople(sheet(...rows));
    expect(people.map((p) => p.role)).toEqual(["admin", "it_staff", null, null, null]);
    expect(notes).toEqual([
      "Gone One: no account, because they are inactive.",
      `No Mail: no email, so no.mail@${PLACEHOLDER_DOMAIN} is used.`,
      "No Mail: no account, because they have no email.",
      'Odd Role: role "owner" is not admin, IT staff or employee, so no account is made.',
    ]);
  });

  it("skips empty rows and notes rows without a name", () => {
    const { people, notes } = cleanPeople([...sheet(person), [null, null, null], [null, null, null, "Clerk", "IT", "x@example.test"]]);
    expect(people).toHaveLength(1);
    expect(notes).toEqual(["Row 4: skipped, no name."]);
  });

  it("refuses a sheet without a name or department column", () => {
    expect(() => cleanPeople([["Email", "Department"]])).toThrow(/Full Name/);
    expect(() => cleanPeople([["Full Name", "Email"]])).toThrow(/Department/);
    expect(() => cleanPeople([])).toThrow(/Full Name/);
  });
});
