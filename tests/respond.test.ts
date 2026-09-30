import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ref } from "@/lib/domain";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const tickets = await import("@/server/services/tickets");
const respond = await import("@/server/services/respond");
const settings = await import("@/server/settings");

type User = Awaited<ReturnType<typeof asUser>>;
let it_: User;
let admin: User;
let employee: User;

beforeAll(async () => {
  await seedDemo(NOW);
  [admin, it_, employee] = await Promise.all(["admin@applus.test", "it@applus.test", "employee@applus.test"].map(asUser));
}, 120_000);

const DAY = 86_400_000;
const input = {
  type: "request" as const,
  subject: "Docking station <not> charging",
  description: "The laptop does not charge on the dock.",
  issueType: "hardware",
  location: "jeddah",
  priority: "medium" as const,
  requesterId: null as number | null,
  assigneeId: null,
  assetId: null,
};

/** A ticket for the demo employee, resolved by IT; returns it with the token from its email. */
async function resolved() {
  const ticket = await tickets.createTicket(it_, { ...input, requesterId: employee.employeeId, assigneeId: it_.id });
  await tickets.updateTicket(it_, ticket.id, { status: "resolved", resolution: "Replaced the dock's power supply." });
  const [email] = await db.select().from(s.emails).where(eq(s.emails.ticketId, ticket.id)).orderBy(desc(s.emails.id)).limit(1);
  const token = /\/en\/respond\/([\w-]+)\?answer=fixed/.exec(email?.html ?? "")?.[1];
  return { ticket, email, token: token! };
}

const lastAudit = async () => (await db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(1))[0];

describe("the resolution email", () => {
  it("goes to the requester with links in both languages, and is held while sending is off", async () => {
    const { ticket, email, token } = await resolved();
    const [requester] = await db.select().from(s.employees).where(eq(s.employees.id, employee.employeeId!));
    expect(email).toMatchObject({ kind: "resolution", recipient: requester.email, status: "held" });
    expect(email.subject).toMatch(/^IT\d{6} is resolved\. Is it fixed\? \| /);
    expect(email.html).toContain(`/ar/respond/${token}?answer=not-fixed`);
    expect(email.html).toContain("Docking station &lt;not&gt; charging");
    expect(email.text).toContain("Replaced the dock's power supply.");
    expect(token.length).toBeGreaterThanOrEqual(43);
    // Only a hash of the token is stored.
    const [link] = await db.select().from(s.emailLinks).where(eq(s.emailLinks.ticketId, ticket.id));
    expect(link.tokenHash).not.toContain(token);
    expect(link.expiresAt.getTime() - (await tickets.getTicket(it_, ticket.id)).resolvedAt!.getTime()).toBe(3 * DAY);
  });

  it("is not sent to a placeholder address", async () => {
    const [person] = await db
      .insert(s.employees)
      .values({ name: "No Mail", email: "no.mail@no-email.invalid", department: "operations", location: "jeddah", jobTitle: "Employee" })
      .returning();
    const ticket = await tickets.createTicket(it_, { ...input, requesterId: person.id });
    await tickets.updateTicket(it_, ticket.id, { status: "resolved", resolution: "Done." });
    expect(await db.select().from(s.emails).where(and(eq(s.emails.ticketId, ticket.id), eq(s.emails.kind, "resolution")))).toEqual([]);
  });
});

describe("answering from the link", () => {
  it("shows the request and IT's note, and nothing else", async () => {
    const { ticket, token } = await resolved();
    expect(await respond.readLink(token)).toEqual({
      ref: ref("ticket", ticket.id),
      subject: ticket.subject,
      resolution: "Replaced the dock's power supply.",
      name: "Nora Al-Otaibi",
      state: "open",
    });
    await expect(respond.readLink("not-a-real-token")).rejects.toMatchObject({ status: 404 });
  });

  it("closes the ticket with a rating, as the requester, and works only once", async () => {
    const { ticket, token } = await resolved();
    await respond.answerLink(token, { answer: "fixed", rating: 4 });
    expect(await tickets.getTicket(it_, ticket.id)).toMatchObject({ status: "closed", satisfaction: 4 });
    expect(await lastAudit()).toMatchObject({ userId: employee.id, userName: "Nora Al-Otaibi" });
    expect((await lastAudit()).summary).toMatch(/^Updated IT\d{6} by email: status closed, rated 4\/5$/);
    expect((await respond.readLink(token)).state).toBe("used");
    await expect(respond.answerLink(token, { answer: "not_fixed", reason: "Again" })).rejects.toMatchObject({ status: 409 });
  });

  it("reopens the ticket with the reason as a comment", async () => {
    const { ticket, token } = await resolved();
    await respond.answerLink(token, { answer: "not_fixed", reason: "It stopped charging again after an hour." });
    const after = await tickets.getTicket(it_, ticket.id);
    expect(after).toMatchObject({ status: "open", reopenCount: 1, resolvedAt: null });
    expect(after.comments.at(-1)).toMatchObject({ authorName: "Nora Al-Otaibi", body: "It stopped charging again after an hour." });
  });

  it("stops working once the ticket is answered in the app, once it expires, and when a newer link is sent", async () => {
    const first = await resolved();
    await tickets.updateTicket(employee, first.ticket.id, { status: "closed", satisfaction: 5 });
    expect((await respond.readLink(first.token)).state).toBe("answered");

    const second = await resolved();
    expect((await respond.readLink(second.token, new Date(Date.now() + 4 * DAY))).state).toBe("expired");
    await expect(respond.answerLink(second.token, { answer: "fixed" }, new Date(Date.now() + 4 * DAY))).rejects.toMatchObject({ status: 409 });

    // Reopened by IT and resolved again: only the newest email's link works.
    await tickets.updateTicket(it_, second.ticket.id, { status: "open" });
    await tickets.updateTicket(it_, second.ticket.id, { status: "resolved", resolution: "Second try." });
    const [newest] = await db.select().from(s.emails).where(eq(s.emails.ticketId, second.ticket.id)).orderBy(desc(s.emails.id)).limit(1);
    const newToken = /\/en\/respond\/([\w-]+)\?/.exec(newest.html)![1];
    expect((await respond.readLink(second.token)).state).toBe("expired");
    expect((await respond.readLink(newToken)).state).toBe("open");
  });
});

describe("closing unanswered tickets", () => {
  it("closes resolved tickets after the set number of days, and leaves newer ones", async () => {
    const { ticket: old } = await resolved();
    const { ticket: recent } = await resolved();
    await db.update(s.tickets).set({ resolvedAt: new Date(Date.now() - 3 * DAY - 60_000) }).where(eq(s.tickets.id, old.id));
    expect(await respond.autoCloseResolved()).toBeGreaterThanOrEqual(1);
    expect(await tickets.getTicket(it_, old.id)).toMatchObject({ status: "closed", satisfaction: null });
    expect((await tickets.getTicket(it_, recent.id)).status).toBe("resolved");
    const [entry] = await db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.entity, "ticket"), eq(s.auditLog.entityId, String(old.id))))
      .orderBy(desc(s.auditLog.id))
      .limit(1);
    expect(entry).toMatchObject({ userName: "System" });
    expect(entry.summary).toMatch(/status closed \(no answer in 3 days\)$/);

    await settings.putSetting("tickets", { autoCloseDays: 1 }, admin);
    await db.update(s.tickets).set({ resolvedAt: new Date(Date.now() - DAY - 60_000) }).where(eq(s.tickets.id, recent.id));
    await respond.autoCloseResolved();
    expect((await tickets.getTicket(it_, recent.id)).status).toBe("closed");
    await settings.putSetting("tickets", { autoCloseDays: 3 }, admin);
  });

  it("tells the requester in the app when an unanswered fix will close", async () => {
    const { ticket } = await resolved();
    const shown = await tickets.getTicket(employee, ticket.id);
    expect(shown.closesAt!.getTime() - shown.resolvedAt!.getTime()).toBe(3 * DAY);
  });
});
