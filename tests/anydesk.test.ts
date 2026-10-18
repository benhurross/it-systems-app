import { describe, expect, it } from "vitest";
import { anydeskLink, formatAnydeskId } from "@/lib/anydesk";

describe("AnyDesk IDs", () => {
  it("are shown in groups of three, as AnyDesk shows them, and open AnyDesk to the device", () => {
    expect(formatAnydeskId("123456789")).toBe("123 456 789");
    expect(formatAnydeskId("1234567890")).toBe("1 234 567 890");
    expect(formatAnydeskId("lt-sara@ad")).toBe("lt-sara@ad");
    expect(anydeskLink("123456789")).toBe("anydesk:123456789");
  });
});
