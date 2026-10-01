import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { auth } = await import("@/server/auth");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const { cleanPeopleSheet, cleanTickets, importTickets, matchRequester, matchStaff } = await import("@/server/seed/tickets");
const tickets = await import("@/server/services/tickets");

type Lists = Parameters<typeof cleanTickets>[1] & Parameters<typeof cleanPeopleSheet>[1];
let lists: Lists;
beforeAll(async () => {
  await seedDemo(NOW);
  const rows = await db.select().from(s.lookups).where(inArray(s.lookups.list, ["location", "issue_type", "channel", "department"]));
  const list = (name: string) => rows.filter((l) => l.list === name);
  lists = { location: list("location"), issue_type: list("issue_type"), channel: list("channel"), department: list("department") };
}, 120_000);

/** A cell Excel read month first: "03/04/2024" (3 April) became 4 March. */
const misread = (y: number, day: number, month: number, h = 9) => new Date(Date.UTC(y, day - 1, month, h, 0, 0) - 1);

const HEADER = ["TicketNo", "OpenedDate", "Location", null, "IssueType", "User", "Description", "Status", "ClosedDate", "ClosedBy", "Reopened", "ReopenedDate"];
// Invented people and tickets, in the log's shape.
const SHEET = [
  HEADER,
  ["IT000001", "15/02/2024 10:46:37", "Jeddah", null, "Email Issues", "Test Person", "Outlook archive", "Closed", "15/02/2024 11:02:37", "Helpdesk", null, null],
  ["IT000002", misread(2024, 3, 4), "Riyadh", "Wattsap", "Other Request", "Finance Finance", "New mouse", "Closed", misread(2024, 3, 4, 10), "Omar", null, null],
  ["IT000004", "20/04/2024 08:00:00", "Jeddah", "phone", "Periodic Maintenance", "Finance Team", "Clean printers", "Closed", "20/04/2024 09:00:00", "Helpdesk", "Yes", "20/04/2024 08:30:00"],
  ["IT000005", misread(2024, 1, 5), "Jeddah", "Email Alert", "Printer Issues", "Nobody Known", "Paper jam", "Closed", "25/04/2024", "Someone", null, null],
  ["IT000006", "02/05/2024 12:00:00", "Mars", "Pigeon", "Hardware Issues", "Test Person", "Screen", "Open", null, null, null, null],
  ["", null, null, null, null, null, null, null, null, null, null, null],
];

describe("reading the ticket log", () => {
  it("puts back dates Excel read month first, keeping tickets in number order", () => {
    const { tickets: rows, notes } = cleanTickets(SHEET, lists);
    expect(rows.map((t) => t.number)).toEqual([1, 2, 4, 5, 6]);
    // Times in the log are Riyadh's (UTC+3).
    expect(rows[0].openedAt.toISOString()).toBe("2024-02-15T07:46:37.000Z");
    expect(rows[1].openedAt.toISOString()).toBe("2024-04-03T06:00:00.000Z");
    expect(rows[3].openedAt.toISOString()).toBe("2024-05-01T06:00:00.000Z");
    expect(notes[0]).toMatch(/Excel read month first/);
  });

  it("maps issue types, locations, status, how it came in, who closed it and reopening", () => {
    const [first, second, third, fourth, fifth] = cleanTickets(SHEET, lists).tickets;
    expect(first).toMatchObject({ type: "incident", issueType: "email", location: "jeddah", status: "closed", channel: null, closedBy: "Helpdesk", reopened: false, subject: "Outlook archive" });
    expect(second).toMatchObject({ type: "request", issueType: "other", location: "riyadh", channel: "whatsapp", closedBy: "Omar" });
    expect(third).toMatchObject({ type: "request", issueType: "periodic_maintenance", channel: "phone", reopened: true });
    expect(third.reopenedAt?.toISOString()).toBe("2024-04-20T05:30:00.000Z");
    expect(fourth).toMatchObject({ issueType: "other", channel: "email_alert" });
    expect(fifth).toMatchObject({ status: "open", closedAt: null, closedBy: null, location: "jeddah", channel: null });
  });

  it("notes what it had to guess", () => {
    const { tickets: rows, notes } = cleanTickets(SHEET, lists);
    // Closed on 25 April, before it opened on 1 May: it closes when it opened.
    expect(rows[3].closedAt).toEqual(rows[3].openedAt);
    expect(notes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^IT000005: closed \(2024-04-2\d\) before it opened/),
        'IT000005: issue type "Printer Issues" is not in the list, so it is "other".',
        'IT000006: location "Mars" is not in the list, so it is jeddah.',
        'IT000006: received by "Pigeon" is not in the list, so it is not recorded.',
      ]),
    );
  });

  it("reads dates that are already right as they are", () => {
    const right = [HEADER, ...[1, 2, 3].map((n) => [`IT00000${n}`, new Date(Date.UTC(2024, 0, n * 3, 9)), "Jeddah", null, "Email Issues", "Test Person", "x", "Closed", new Date(Date.UTC(2024, 0, n * 3, 10)), null, null, null])];
    const { tickets: rows, notes } = cleanTickets(right, lists);
    expect(rows.map((t) => t.openedAt.toISOString().slice(0, 10))).toEqual(["2024-01-03", "2024-01-06", "2024-01-09"]);
    expect(notes).toEqual([]);
  });
});

describe("who is who", () => {
  const people = [
    { id: 1, name: "Tariq Al-Sayed" },
    { id: 2, name: "Nawaf Qasim" },
    { id: 3, name: "Reem Fahad Al Saleh" },
  ];
  it("finds people by name, without middle names, or one letter apart", () => {
    expect(matchRequester("tariq  al-sayed", people)).toMatchObject({ kind: "exact", id: 1 });
    expect(matchRequester("Tariq Hamad Al-Sayed", people)).toMatchObject({ kind: "close", id: 1 });
    expect(matchRequester("Nawaf Qassim", people)).toMatchObject({ kind: "close", id: 2 });
    expect(matchRequester("Reem Fahad Alsaleh", people)).toMatchObject({ kind: "exact", id: 3 });
    expect(matchRequester("Dana Alsaleh", people)).toEqual({ kind: "unknown", name: "Dana Alsaleh" });
  });

  it("turns shared mailboxes into teams", () => {
    for (const name of ["Finance Finance", "Finance Team", "finance"]) {
      expect(matchRequester(name, people)).toEqual({ kind: "team", name: "Finance team" });
    }
  });

  it("finds IT staff by name, first name, or the mailbox they use", () => {
    const staff = [
      { id: "a", name: "Hamad Ali Nasser", email: "h.nasser@x.test" },
      { id: "b", name: "Saeed Karim", email: "helpdesk@x.test" },
      { id: "c", name: "Yasir Omari", email: "projects@x.test" },
      { id: "d", name: "Yasir Omari", email: "y.omari@x.test" },
      { id: "e", name: "Saeed Other", email: "s.other@x.test" },
    ];
    expect(matchStaff("Hamad", staff)?.id).toBe("a");
    expect(matchStaff("Saeed Karim", staff)?.id).toBe("b");
    expect(matchStaff("Helpdesk", staff)?.id).toBe("b");
    // Two accounts for one person: still them.
    expect(matchStaff("Yasir", staff)?.name).toBe("Yasir Omari");
    // Two different people: nobody.
    expect(matchStaff("Saeed", staff)).toBeUndefined();
  });

  it("reads the People sheet", () => {
    const { fixes, notes } = cleanPeopleSheet(
      [
        ["Name in log", "Name", "Email", "Department", "Job title", "Location", "ID number", "Status", "Account"],
        ["Helpdesk", "Saeed Karim", "Helpdesk@X.test", "IT", "IT Officer", "Jeddah", null, "Current", "IT staff"],
        ["Old Name", "Someone Left", "not an email", "Moon", null, null, "77", "Left", null],
        ["SBG", null, null, null, null, null, null, "Shared mailbox", null],
        [null, null, null, null, null, null, null, null, null],
      ],
      lists,
    );
    expect(fixes).toEqual([
      { inLog: "Helpdesk", name: "Saeed Karim", email: "helpdesk@x.test", department: "it", jobTitle: "IT Officer", location: "jeddah", employeeNumber: null, status: "current", account: "it_staff" },
      { inLog: "Old Name", name: "Someone Left", email: null, department: null, jobTitle: null, location: null, employeeNumber: "77", status: "left", account: null },
      { inLog: "SBG", name: "SBG", email: null, department: null, jobTitle: null, location: null, employeeNumber: null, status: "mailbox", account: null },
    ]);
    expect(notes).toEqual([
      'People: "not an email" for Someone Left is not an email address, so none is used.',
      'People: department "Moon" for Someone Left is not in the list, so the default is used.',
    ]);
  });
});

describe("loading the log", () => {
  it("reports without changing anything unless asked to replace", async () => {
    const before = await db.$count(s.tickets);
    const report = await importTickets(cleanTickets(SHEET, lists).tickets, { replace: false });
    expect(report).toMatchObject({ tickets: 5, existing: before, reopened: 1 });
    expect(report.added.map((a) => [a.name, a.kind, a.status, a.tickets]).sort()).toEqual([
      ["Finance team", "team", "mailbox", 2],
      ["Nobody Known", "unknown", "left", 1],
      ["Test Person", "unknown", "left", 2],
    ]);
    expect(report.closers).toEqual(
      expect.arrayContaining([
        { from: "Omar", to: "Omar Haddad", tickets: 1 },
        { from: "Helpdesk", to: null, tickets: 2 },
      ]),
    );
    expect(await db.$count(s.tickets)).toBe(before);
  });

  it("replaces every ticket, keeping the log's numbers, history and times", async () => {
    await importTickets(cleanTickets(SHEET, lists).tickets, { replace: true });
    const rows = await db.select().from(s.tickets).orderBy(s.tickets.id);
    expect(rows.map((t) => t.id)).toEqual([1, 2, 4, 5, 6]);
    const [omar] = await db.select().from(s.users).where(eq(s.users.email, "it@applus.test"));
    expect(rows[1]).toMatchObject({ status: "closed", priority: "medium", assigneeId: omar.id, channel: "whatsapp", description: "New mouse" });
    expect(rows[1].createdAt.toISOString()).toBe("2024-04-03T06:00:00.000Z");
    expect(rows[1].closedAt?.toISOString()).toBe("2024-04-03T07:00:00.000Z");
    expect(rows[0].assigneeId).toBeNull();
    expect(rows[2].reopenCount).toBe(1);

    const history = (id: number) =>
      db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "ticket"), eq(s.auditLog.entityId, String(id)))).orderBy(s.auditLog.at);
    expect((await history(2)).map((h) => [h.userName, h.summary])).toEqual([
      ["Ticket log", "Opened IT000002: New mouse (from the ticket log)"],
      ["Omar Haddad", "Updated IT000002: status closed"],
    ]);
    expect((await history(4)).map((h) => h.summary)).toEqual([
      "Opened IT000004: Clean printers (from the ticket log)",
      "Updated IT000004: status open (reopened)",
      "Updated IT000004: status closed",
    ]);

    const [team] = await db.select().from(s.employees).where(eq(s.employees.name, "Finance team"));
    expect(team).toMatchObject({ jobTitle: "Shared mailbox", active: true, location: "riyadh" });
    const [unknown] = await db.select().from(s.employees).where(eq(s.employees.name, "Nobody Known"));
    expect(unknown).toMatchObject({ jobTitle: "Not on the staff list", active: false });
    expect(rows.filter((t) => t.requesterId === team.id).map((t) => t.id)).toEqual([2, 4]);
  });

  it("carries on numbering after the log, and loads again without adding people twice", async () => {
    const it_ = await asUser("it@applus.test");
    const [requester] = await db.select().from(s.employees).limit(1);
    const next = await tickets.createTicket(it_, {
      type: "request", subject: "After the log", description: "New.", issueType: "other", location: "jeddah", priority: "medium", requesterId: requester.id, assigneeId: null, assetId: null,
    });
    expect(next.id).toBe(7);

    const people = await db.$count(s.employees);
    const report = await importTickets(cleanTickets(SHEET, lists).tickets, { replace: true });
    expect(report.added).toEqual([]);
    expect(await db.$count(s.employees)).toBe(people);
    expect(await db.$count(s.tickets)).toBe(5);
  });

  it("follows the People sheet: who names are, who to add, and accounts to make", async () => {
    const [omarEmployee] = await db.select().from(s.employees).where(eq(s.employees.name, "Omar Haddad"));
    const { fixes } = cleanPeopleSheet(
      [
        ["Name in log", "Name", "Email", "Department", "Job title", "Location", "ID number", "Status", "Account"],
        ["Helpdesk", "Saeed Karim", "helpdesk@applus.test", "IT", "IT Officer", "Jeddah", null, "Current", "IT staff"],
        ["Test Person", "Omar Haddad", null, null, null, null, null, null, null],
        ["Someone", "Lina Former", "lina.former@applus.test", "Sales", "Sales Director", null, null, "Left", null],
        ["Nobody Known", "Nadia Later", null, null, null, null, null, "Current", null],
      ],
      lists,
    );
    const ticketRows = cleanTickets(SHEET, lists).tickets;
    const dry = await importTickets(ticketRows, { replace: false, people: fixes });
    expect(dry.closers).toEqual(expect.arrayContaining([{ from: "Helpdesk", to: "Saeed Karim (new account)", tickets: 2 }]));
    expect(dry.close).toEqual(expect.arrayContaining([{ from: "Test Person", to: "Omar Haddad", tickets: 2 }]));

    const report = await importTickets(ticketRows, { replace: true, people: fixes });
    expect(report.accounts).toEqual([{ name: "Saeed Karim", email: "helpdesk@applus.test", role: "it_staff", password: expect.any(String) }]);
    const [saeed] = await db.select().from(s.users).where(eq(s.users.email, "helpdesk@applus.test"));
    const [saeedEmployee] = await db.select().from(s.employees).where(eq(s.employees.email, "helpdesk@applus.test"));
    expect(saeed).toMatchObject({ role: "it_staff", employeeId: saeedEmployee.id });
    expect(saeedEmployee).toMatchObject({ name: "Saeed Karim", department: "it", jobTitle: "IT Officer", active: true });
    expect((await auth.api.signInEmail({ body: { email: "helpdesk@applus.test", password: report.accounts[0].password } })).user.name).toBe("Saeed Karim");

    const rows = await db.select().from(s.tickets).orderBy(s.tickets.id);
    expect(rows[0]).toMatchObject({ requesterId: omarEmployee.id, assigneeId: saeed.id });
    const [nadia] = await db.select().from(s.employees).where(eq(s.employees.name, "Nadia Later"));
    expect(nadia).toMatchObject({ active: true, jobTitle: "Employee" });
    expect(rows.find((t) => t.id === 5)?.requesterId).toBe(nadia.id);
    // Lina is not in the log as a requester ("Someone" only closed a ticket), so she is not added.
    expect(await db.$count(s.employees, eq(s.employees.name, "Lina Former"))).toBe(0);

    // A second load finds the account and the people made by the first.
    const again = await importTickets(ticketRows, { replace: true, people: fixes });
    expect(again.accounts).toEqual([]);
    expect(again.added).toEqual([]);
  });
});
