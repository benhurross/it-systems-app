import { describe, expect, it } from "vitest";
import { cleanMac, cleanSerial, deviceChanges, deviceKey, matchDevice, requestIp } from "@/lib/device-match";

const assets = [
  { id: 1, name: "DT-001", serial: "5CD1234XYZ", macAddress: "AA-BB-CC-DD-EE-01" },
  { id: 2, name: "LT-002", serial: "To be filled by O.E.M.", macAddress: "aa:bb:cc:dd:ee:02" },
  { id: 3, name: "RECEPTION-PC", serial: null, macAddress: null },
];

describe("a PC seen at sign-in", () => {
  it("is matched by serial, then MAC, then name", () => {
    expect(matchDevice({ serial: "5cd1234xyz", mac: null, computerName: "FIN-PC-07" }, assets)).toEqual({ assetId: 1, matchedBy: "serial" });
    expect(matchDevice({ serial: null, mac: "aa:bb:cc:dd:ee:02", computerName: "renamed" }, assets)).toEqual({ assetId: 2, matchedBy: "mac" });
    expect(matchDevice({ serial: null, mac: null, computerName: "reception-pc" }, assets)).toEqual({ assetId: 3, matchedBy: "name" });
    expect(matchDevice({ serial: "NEW123", mac: "aa:bb:cc:dd:ee:99", computerName: "NEW-PC" }, assets)).toEqual({ assetId: null, matchedBy: null });
  });

  it("ignores blank and placeholder serials and MACs", () => {
    for (const s of ["", "  ", "To be filled by O.E.M.", "Default string", "System Serial Number", "0000000", "N/A"]) expect(cleanSerial(s), s).toBeNull();
    expect(cleanSerial(" 5CD1234XYZ ")).toBe("5CD1234XYZ");
    expect(cleanMac("AA-BB-CC-DD-EE-01")).toBe("aa:bb:cc:dd:ee:01");
    expect(cleanMac("00:00:00:00:00:00")).toBeNull();
    expect(cleanMac("not a mac")).toBeNull();
  });

  it("is kept under its serial, else its MAC, else its name", () => {
    expect(deviceKey({ serial: "5CD1234XYZ", mac: "aa:bb:cc:dd:ee:01", computerName: "X" })).toBe("serial:5cd1234xyz");
    expect(deviceKey({ serial: null, mac: "aa:bb:cc:dd:ee:01", computerName: "X" })).toBe("mac:aa:bb:cc:dd:ee:01");
    expect(deviceKey({ serial: null, mac: null, computerName: "FIN-PC" })).toBe("name:fin-pc");
  });

  it("shows what changed against the inventory", () => {
    const asset = { name: "DT-001", ipAddress: "192.168.0.10", macAddress: "AA-BB-CC-DD-EE-01" };
    expect(deviceChanges({ computerName: "FIN-PC-07", ip: "192.168.0.57", mac: "aa:bb:cc:dd:ee:01" }, asset)).toEqual({ notInInventory: false, name: true, ip: true, mac: false });
    expect(deviceChanges({ computerName: "dt-001", ip: "192.168.0.10", mac: null }, asset)).toEqual({ notInInventory: false, name: false, ip: false, mac: false });
    expect(deviceChanges({ computerName: "X", ip: null, mac: null }, null).notInInventory).toBe(true);
  });

  it("reads the address the request came from", () => {
    expect(requestIp(new Headers({ "x-forwarded-for": "::ffff:192.168.0.57" }))).toBe("192.168.0.57");
    expect(requestIp(new Headers({ "x-forwarded-for": "192.168.0.57, 10.0.0.1" }))).toBe("192.168.0.57");
    expect(requestIp(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(requestIp(new Headers())).toBeNull();
  });
});
