import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { toolStatus } from "@/lib/tools";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const settings = await import("@/server/settings");
const tools = await import("@/server/services/tools");

type User = Awaited<ReturnType<typeof asUser>>;
let admin: User;
let employee: User;
let department: string;
beforeAll(async () => {
  await seedDemo(NOW);
  [admin, employee] = await Promise.all(["admin@applus.test", "employee@applus.test"].map(asUser));
  [{ department }] = await db.select({ department: s.employees.department }).from(s.employees).where(eq(s.employees.id, employee.employeeId!));
}, 120_000);

const statusOf = async (user: User, key: string) => (await tools.myTools(user)).find((t) => t.key === key)!;

describe("who may use a tool", () => {
  it("lets off win, then a person's exception, then their department, then the tool's setting", () => {
    const on = { mode: "on" as const, blockedDepartments: ["sales"] };
    expect(toolStatus({ ...on, mode: "off" }, null, "allowed")).toBe("off");
    expect(toolStatus(on, "sales", "allowed")).toBe("allowed");
    expect(toolStatus(on, "sales", null)).toBe("blocked");
    expect(toolStatus(on, "finance", "blocked")).toBe("blocked");
    expect(toolStatus({ ...on, mode: "approval" }, "finance", null)).toBe("approval");
    expect(toolStatus({ ...on, mode: "approval" }, "finance", "requested")).toBe("requested");
    expect(toolStatus(on, "finance", null)).toBe("allowed");
  });

  it("opens every tool to everyone until an admin says otherwise", async () => {
    expect((await tools.myTools(employee)).every((t) => t.status === "allowed")).toBe(true);
  });
});

describe("asking for a tool", () => {
  it("opens a ticket, and granting it resolves the ticket and opens the tool", async () => {
    await settings.putSetting("tools", { pdf_merge: { mode: "approval", blockedDepartments: [] } }, admin);
    expect((await statusOf(employee, "pdf_merge")).status).toBe("approval");
    await expect(tools.recordUse(employee, "pdf_merge")).rejects.toMatchObject({ status: 403 });

    const { ticketId } = await tools.requestTool(employee, "pdf_merge", "For combining claim documents.");
    expect(await statusOf(employee, "pdf_merge")).toMatchObject({ status: "requested", ticketId });
    const [ticket] = await db.select().from(s.tickets).where(eq(s.tickets.id, ticketId));
    expect(ticket).toMatchObject({ subject: "Access to the Merge PDFs tool", issueType: "login", requesterId: employee.employeeId, channel: "app" });
    expect(ticket.description).toContain("For combining claim documents.");
    await expect(tools.requestTool(employee, "pdf_merge", null)).rejects.toMatchObject({ status: 400, message: "alreadyRequested" });

    const { requests } = await tools.toolsOverview(NOW);
    const request = requests.find((r) => r.tool === "pdf_merge" && r.userId === employee.id)!;
    await tools.decideRequest(request.id, true, admin);
    expect((await statusOf(employee, "pdf_merge")).status).toBe("allowed");
    const [resolved] = await db.select().from(s.tickets).where(eq(s.tickets.id, ticketId));
    expect(resolved).toMatchObject({ status: "resolved", assigneeId: admin.id });
    expect(resolved.resolution).toMatch(/^The Merge PDFs tool is now switched on for you\./);
  });

  it("leaves the tool as it was when the request is declined", async () => {
    await settings.putSetting("tools", { pdf_split: { mode: "approval", blockedDepartments: [] } }, admin);
    const { ticketId } = await tools.requestTool(employee, "pdf_split", null);
    const request = (await tools.toolsOverview(NOW)).requests.find((r) => r.tool === "pdf_split")!;
    await tools.decideRequest(request.id, false, admin);
    expect((await statusOf(employee, "pdf_split")).status).toBe("approval");
    const [resolved] = await db.select().from(s.tickets).where(eq(s.tickets.id, ticketId));
    expect(resolved.resolution).toMatch(/was not approved/);
  });

  it("is refused for a tool that is open, blocked or off", async () => {
    await settings.putSetting("tools", {}, admin);
    await expect(tools.requestTool(employee, "pdf_stamp", null)).rejects.toMatchObject({ message: "notRequestable" });
  });
});

describe("blocking and allowing", () => {
  it("blocks a department, and a person's own exception overrides it", async () => {
    await settings.putSetting("tools", { pdf_organize: { mode: "on", blockedDepartments: [department] } }, admin);
    expect((await statusOf(employee, "pdf_organize")).status).toBe("blocked");
    const exception = await tools.setException({ userId: employee.id, tool: "pdf_organize", state: "allowed" }, admin);
    expect((await statusOf(employee, "pdf_organize")).status).toBe("allowed");
    await tools.removeException(exception.id, admin);
    expect((await statusOf(employee, "pdf_organize")).status).toBe("blocked");
  });

  it("blocks one person, and off is off for everyone", async () => {
    await settings.putSetting("tools", {}, admin);
    await tools.setException({ userId: employee.id, tool: "images_to_pdf", state: "blocked" }, admin);
    expect((await statusOf(employee, "images_to_pdf")).status).toBe("blocked");
    expect((await statusOf(admin, "images_to_pdf")).status).toBe("allowed");
    await settings.putSetting("tools", { images_to_pdf: { mode: "off", blockedDepartments: [] } }, admin);
    expect((await statusOf(admin, "images_to_pdf")).status).toBe("off");
    await settings.putSetting("tools", {}, admin);
  });
});

describe("counting use", () => {
  it("counts each file a tool made, in the last 30 days and in all", async () => {
    await tools.recordUse(employee, "pdf_stamp");
    await tools.recordUse(admin, "pdf_stamp");
    await db.insert(s.toolUses).values({ tool: "pdf_stamp", userId: admin.id, at: new Date(NOW.getTime() - 60 * 86_400_000) });
    const overview = await tools.toolsOverview(NOW);
    expect(overview.tools.find((t) => t.key === "pdf_stamp")).toMatchObject({ recentUses: 2, totalUses: 3, mode: "on" });
  });
});
