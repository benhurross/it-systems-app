import { describe, expect, it } from "vitest";
import { employeeInput } from "@/lib/schemas";

const base = { name: "Test Person", email: "t.person@applus.test", department: "sales", location: "jeddah", jobTitle: "Account Manager", employeeNumber: null, phone: null, active: true };

describe("an employee's mobile number", () => {
  it("is kept as written, its spaces tidied, or left empty", () => {
    expect(employeeInput.parse({ ...base, mobile: "+966 55  123 4567" }).mobile).toBe("+966 55 123 4567");
    expect(employeeInput.parse({ ...base, mobile: "0551234567" }).mobile).toBe("0551234567");
    expect(employeeInput.parse({ ...base, mobile: "(055) 123-4567" }).mobile).toBe("(055) 123-4567");
    expect(employeeInput.parse({ ...base, mobile: null }).mobile).toBeNull();
    expect(employeeInput.parse({ ...base, mobile: "" }).mobile).toBeNull();
    expect(employeeInput.parse(base).mobile).toBeNull();
  });

  it("refuses what is not a phone number", () => {
    for (const mobile of ["abc", "12345", "+966 55 123 4567 8901 23", "055-123-45x7"]) {
      const result = employeeInput.safeParse({ ...base, mobile });
      expect(result.success, mobile).toBe(false);
      expect(result.error?.issues[0].message).toBe("validation.mobile");
    }
  });
});
