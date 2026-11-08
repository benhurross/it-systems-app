import { describe, expect, it } from "vitest";
import { emptyFormData, formDate, gridKey, itFormInput, MAINTENANCE_TASKS, OASIS_KEYS, privilegeKey } from "@/lib/it-forms";

describe("the IT forms", () => {
  it("start empty, every field at its default", () => {
    const incident = emptyFormData("incident_repair");
    expect(incident.person.name).toBe("");
    expect(incident.incident).toMatchObject({ on: false, severity: "" });
    expect(emptyFormData("maintenance").tasks).toHaveLength(MAINTENANCE_TASKS.length);
    expect(emptyFormData("it_request").oasis.privileges).toEqual([]);
    expect(emptyFormData("credentials").items).toEqual([]);
  });

  it("take what is filled in, and fill the rest", () => {
    const parsed = itFormInput.parse({ kind: "incident_repair", employeeId: 3, data: { person: { name: "Test Person" }, incident: { on: true, severity: "high", description: "Sparks" } } });
    expect(parsed.kind).toBe("incident_repair");
    if (parsed.kind !== "incident_repair") throw new Error();
    expect(parsed.data.incident).toMatchObject({ on: true, severity: "high", description: "Sparks", diagnosis: "" });
    expect(parsed.data.person.email).toBe("");
  });

  it("knows every OASIS privilege, and refuses others", () => {
    expect(OASIS_KEYS.has(privilegeKey("production", "production"))).toBe(true);
    expect(OASIS_KEYS.has(gridKey("production", "production", "lines", "Entry Approval", "Motor"))).toBe(true);
    expect(OASIS_KEYS.has(privilegeKey("hr", "hr", "payroll"))).toBe(true);
    expect(OASIS_KEYS.size).toBeGreaterThan(90);
    const ok = { kind: "it_request", data: { oasis: { on: true, privileges: [gridKey("claims", "claims", "lines", "View", "Medical")] } } };
    expect(itFormInput.safeParse(ok).success).toBe(true);
    expect(itFormInput.safeParse({ kind: "it_request", data: { oasis: { privileges: ["hacked.everything"] } } }).success).toBe(false);
  });

  it("refuses a form of no known kind, and a maintenance list of the wrong length", () => {
    expect(itFormInput.safeParse({ kind: "payroll", data: {} }).success).toBe(false);
    expect(itFormInput.safeParse({ kind: "maintenance", data: { tasks: ["done"] } }).success).toBe(false);
  });

  it("writes dates as the paper forms do", () => {
    expect(formDate("2025-10-20")).toBe("20-Oct-2025");
    expect(formDate("")).toBe("");
  });
});

describe("saving IT forms", async () => {
  const { vi, beforeAll } = await import("vitest");
  const { createTestDb } = await import("./helpers/db");
  vi.doMock("@/server/db", async () => ({ db: await createTestDb() }));
  const { seedDemo } = await import("@/server/seed/demo");
  const { asUser, NOW } = await import("./helpers/seeded");
  const forms = await import("@/server/services/it-forms");
  let admin: Awaited<ReturnType<typeof asUser>>;
  beforeAll(async () => {
    await seedDemo(NOW);
    admin = await asUser("admin@applus.test");
  }, 120_000);

  it("keeps a form, corrects it as the same kind only, and deletes it", async () => {
    const input = itFormInput.parse({ kind: "credentials", data: { person: { name: "Test Person" }, emailId: "t.person@applus.test", outlookUrl: "https://mail.example.test/owa", signedBy: "Sara Al-Harbi" } });
    const { id } = await forms.createItForm(input, admin);
    const saved = await forms.getItForm(id);
    expect(saved).toMatchObject({ kind: "credentials", employeeName: "Test Person", createdByName: admin.name });
    expect((await forms.listItForms({ kind: "credentials" })).map((f) => f.id)).toContain(id);
    // A new credential sheet starts with the links and signer last written.
    expect(await forms.itFormStart("credentials")).toEqual({ outlookUrl: "https://mail.example.test/owa", ticketingUrl: "", signedBy: "Sara Al-Harbi" });
    await expect(forms.updateItForm(id, itFormInput.parse({ kind: "maintenance", data: {} }), admin)).rejects.toThrow();
    await forms.updateItForm(id, itFormInput.parse({ ...input, data: { ...input.data, oasisId: "U-1" } }), admin);
    expect(((await forms.getItForm(id)).data as { oasisId: string }).oasisId).toBe("U-1");
    await forms.deleteItForm(id, admin);
    await expect(forms.getItForm(id)).rejects.toThrow();
  });

  it("refuses links to records that do not exist", async () => {
    await expect(forms.createItForm(itFormInput.parse({ kind: "maintenance", employeeId: 999_999, data: {} }), admin)).rejects.toThrow("A linked record does not exist");
  });
});
