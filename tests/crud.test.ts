import { beforeAll, describe, expect, it, vi } from "vitest";
import { changeInput } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));

const { seedDemo } = await import("@/server/seed/demo");
const { asUser, NOW } = await import("./helpers/seeded");
const assets = await import("@/server/services/assets");
const changes = await import("@/server/services/changes");
const finance = await import("@/server/services/finance");
const kb = await import("@/server/services/kb");
const licenses = await import("@/server/services/licenses");
const people = await import("@/server/services/people");
const projects = await import("@/server/services/projects");
const risk = await import("@/server/services/risk");
const { listAudit } = await import("@/server/services/audit-log");

let user: Awaited<ReturnType<typeof asUser>>;
beforeAll(async () => {
  await seedDemo(NOW);
  user = await asUser("it@applus.test");
}, 120_000);

describe("create, read and update for every register", () => {
  it("assets", async () => {
    const input = {
      name: "LT-TEST",
      category: "end_user",
      type: "laptop",
      manufacturer: "dell",
      model: "Latitude 7450",
      serial: "TEST123",
      status: "in_stock" as const,
      location: "jeddah",
      assignedTo: null,
      purchaseId: null,
      purchaseDate: "2026-09-01",
      purchaseCost: 4500,
      warrantyEnd: "2029-09-01",
      supportStatus: "supported" as const,
      criticality: "low" as const,
      ipAddress: null,
      macAddress: null,
      os: "Windows 11 Pro",
      notes: null,
      monitorMethod: "none" as const,
      monitorPort: null,
    };
    const created = await assets.createAsset(input, user);
    const updated = await assets.updateAsset(created.id, { ...input, notes: "Spare" }, user);
    expect(updated.notes).toBe("Spare");
    expect((await assets.listAssets()).some((a) => a.name === "LT-TEST")).toBe(true);
    const rel = await assets.createRelationship({ sourceId: created.id, targetId: 1, type: "depends_on" }, user);
    expect((await assets.listRelationships(created.id)).map((r) => r.id)).toEqual([rel.id]);
    await assets.deleteRelationship(rel.id, user);
    expect(await assets.listRelationships(created.id)).toEqual([]);
  });

  it("knowledge articles", async () => {
    const input = { title: "Test article", category: "email", issueType: "email", symptoms: "S", cause: null, resolution: "R", status: "draft" as const, reviewDue: null };
    const created = await kb.createArticle(user, input);
    const updated = await kb.updateArticle(user, created.id, { ...input, status: "published" });
    expect(updated.status).toBe("published");
    expect((await kb.getArticle(user, created.id)).authorName).toBe("Omar Haddad");
  });

  it("changes", async () => {
    expect((await changes.listChanges()).length).toBe(12);
    const [first] = await changes.listChanges();
    expect(await changes.getChange(first.id)).toMatchObject({ id: first.id });
    const requested = (await changes.listChanges()).find((c) => c.status === "requested")!;
    const input = changeInput.parse({ ...requested, plannedAt: requested.plannedAt.toISOString(), notes: "Moved to Thursday" });
    const updated = await changes.updateChange(requested.id, input, user);
    expect(updated.notes).toBe("Moved to Thursday");
  });

  it("licences", async () => {
    const input = { product: "Test Suite", vendorId: null, version: "1", type: "subscription" as const, seats: 3, purchaseDate: null, expiryDate: "2027-01-01", cost: 100, owner: "it", reference: null, notes: null };
    const created = await licenses.createLicense(input, user);
    const updated = await licenses.updateLicense(created.id, { ...input, seats: 5 }, user);
    expect(updated.seats).toBe(5);
  });

  it("vendors, contracts and purchases", async () => {
    const vendorInput = { name: "Test Vendor", category: "hardware", contactName: null, email: "sales@vendor.test", phone: null, website: "https://vendor.test", active: true, notes: null };
    const vendor = await finance.createVendor(vendorInput, user);
    expect((await finance.updateVendor(vendor.id, { ...vendorInput, active: false }, user)).active).toBe(false);
    expect((await finance.listVendors()).length).toBe(11);

    const contractInput = { title: "Test contract", vendorId: vendor.id, category: "services", location: null, startDate: "2026-01-01", endDate: "2026-12-31", annualCost: 1200, autoRenew: false, notes: null };
    const contract = await finance.createContract(contractInput, user);
    expect((await finance.updateContract(contract.id, { ...contractInput, autoRenew: true }, user)).autoRenew).toBe(true);
    expect((await finance.listContracts()).find((c) => c.id === contract.id)?.vendorName).toBe("Test Vendor");

    const purchaseInput = { title: "Test purchase", category: "hardware", vendorId: vendor.id, requestedFor: null, quantity: 1, amount: 99, hardware: true, notes: null };
    const purchase = await finance.createPurchase(purchaseInput, user);
    expect((await finance.updatePurchase(purchase.id, { ...purchaseInput, quantity: 2 }, user)).quantity).toBe(2);
    expect((await finance.listPurchases()).find((p) => p.id === purchase.id)?.requestedByName).toBe("Omar Haddad");
    expect((await finance.budgetSummary()).fiscalYear).toBe(Number(new Date().toISOString().slice(0, 4)));
  });

  it("projects and tasks", async () => {
    const input = { name: "CRUD project", description: null, ownerId: null, status: "planned" as const, startDate: null, dueDate: null };
    const project = await projects.createProject(input, user);
    expect((await projects.updateProject(project.id, { ...input, status: "active" }, user)).status).toBe("active");
    const task = await projects.createTask(project.id, { title: "Only task", assigneeId: null, status: "todo", dueDate: null }, user);
    await projects.deleteTask(task.id, user);
    expect((await projects.getProject(project.id)).tasks).toEqual([]);
    expect((await projects.listProjects()).some((p) => p.name === "CRUD project")).toBe(true);
  });

  it("risks and vulnerabilities", async () => {
    const input = { title: "Test risk", category: "cyber", assetId: null, description: "D", controls: null, likelihood: 2, impact: 3, treatment: null, ownerId: null, status: "open" as const, reviewDate: null };
    const created = await risk.createRisk(input, user);
    expect((await risk.updateRisk(created.id, { ...input, likelihood: 5 }, user)).likelihood).toBe(5);
    expect((await risk.listRisks()).length).toBe(13);
    expect((await risk.listVulnerabilities()).length).toBe(15);
  });

  it("employees, joiners and leavers", async () => {
    const input = { name: "Test Person", email: "test.person@applus.test", department: "sales", location: "jeddah", jobTitle: "Account Manager", employeeNumber: "4321", phone: null, active: true };
    const created = await people.createEmployee(input, user);
    expect((await people.updateEmployee(created.id, { ...input, jobTitle: "Sales Lead" }, user)).jobTitle).toBe("Sales Lead");
    expect((await people.listEmployees()).length).toBe(66);
    expect((await people.listJoiners()).length).toBe(4);
    expect((await people.listLeavers())[0]).toHaveProperty("name");
  });

  it("filters the audit log by date in Riyadh days", async () => {
    const today = await listAudit({ from: "2026-09-29", to: "2026-09-29" });
    expect(today.length).toBeGreaterThan(0);
    expect(await listAudit({ from: "2020-01-01", to: "2020-01-02" })).toEqual([]);
  });
});
