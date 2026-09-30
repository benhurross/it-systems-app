import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const tickets = await import("@/server/services/tickets");

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let it_: User;
let it2: User;
let employee: User;

beforeAll(async () => {
  await seedDemo(NOW);
  [admin, it_, it2, employee] = await Promise.all(
    ["admin@applus.test", "it@applus.test", "it2@applus.test", "employee@applus.test"].map(asUser),
  );
}, 120_000);

const input = {
  type: "request" as const,
  subject: "New starter needs a <laptop>",
  description: "Joining on Sunday in Finance.",
  issueType: "hardware",
  location: "jeddah",
  priority: "medium" as const,
  requesterId: null as number | null,
  assigneeId: null as string | null,
  assetId: null,
};
const emailsFor = (ticketId: number, kind: "new_request" | "assigned") =>
  db.select().from(s.emails).where(and(eq(s.emails.ticketId, ticketId), eq(s.emails.kind, kind))).orderBy(desc(s.emails.id));

describe("a new ticket nobody is assigned to", () => {
  it("emails every admin, with links to accept it or assign it to each IT staff member", async () => {
    const ticket = await tickets.createTicket(employee, input);
    const [email, ...more] = await emailsFor(ticket.id, "new_request");
    expect(more).toEqual([]);
    expect(email).toMatchObject({ recipient: "admin@applus.test", status: "held" });
    expect(email.subject).toMatch(/^New request IT\d{6}: New starter needs a <laptop> \| طلب جديد IT\d{6}: /);
    expect(email.html).toContain(`/en/tickets/${ticket.id}/assign?to=me`);
    expect(email.html).toContain(`/ar/tickets/${ticket.id}/assign?to=me`);
    for (const staff of [it_, it2]) expect(email.html).toContain(`/en/tickets/${ticket.id}/assign?to=${staff.id}`);
    expect(email.html).not.toContain(`assign?to=${admin.id}`);
    expect(email.html).toContain("New starter needs a &lt;laptop&gt;");
    expect(email.text).toContain("Nora Al-Otaibi");
    expect(email.text).toContain("Hardware");
    expect(email.text).toContain("الأجهزة");
  });

  it("says incident for an incident, and does not email the admin who opened it", async () => {
    const incident = await tickets.createTicket(it_, { ...input, type: "incident", requesterId: employee.employeeId });
    expect((await emailsFor(incident.id, "new_request"))[0].subject).toMatch(/^New incident IT\d{6}: .* \| بلاغ عطل جديد /);
    const own = await tickets.createTicket(admin, { ...input, requesterId: employee.employeeId });
    expect(await emailsFor(own.id, "new_request")).toEqual([]);
  });
});

describe("assignment", () => {
  it("emails the person a ticket is assigned to, when someone else assigns it", async () => {
    const ticket = await tickets.createTicket(it_, { ...input, requesterId: employee.employeeId, assigneeId: it2.id });
    expect(await emailsFor(ticket.id, "new_request")).toEqual([]);
    const [created] = await emailsFor(ticket.id, "assigned");
    expect(created).toMatchObject({ recipient: "it2@applus.test" });
    expect(created.subject).toMatch(/^IT\d{6} is assigned to you: /);
    expect(created.text).toContain(`${it_.name} assigned this ticket to you.`);

    await tickets.updateTicket(admin, ticket.id, { assigneeId: it_.id });
    expect((await emailsFor(ticket.id, "assigned"))[0].recipient).toBe("it@applus.test");
  });

  it("stays quiet when someone takes a ticket themselves", async () => {
    const ticket = await tickets.createTicket(employee, input);
    await tickets.updateTicket(it_, ticket.id, { assigneeId: it_.id });
    expect(await emailsFor(ticket.id, "assigned")).toEqual([]);
    const own = await tickets.createTicket(it_, { ...input, requesterId: employee.employeeId, assigneeId: it_.id });
    expect(await emailsFor(own.id, "assigned")).toEqual([]);
  });
});
