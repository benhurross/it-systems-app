import { describe, expect, it } from "vitest";
import { deviceKind, placeDevices, roomAt } from "@/lib/plan-devices";

const device = (id: number, room: string, more: Partial<{ planX: number | null; planY: number | null; outletId: number | null }> = {}) => ({
  id,
  name: `D${id}`,
  room,
  planX: null,
  planY: null,
  outletId: null,
  ...more,
});
const rooms = [
  { text: "Board Room", x: 0.2, y: 0.3 },
  { text: "Server Room", x: 0.8, y: 0.8 },
];
const outlets = [
  { id: 1, x: 0.5, y: 0.5, room: "IT Office" },
  { id: 2, x: 0.6, y: 0.5, room: "IT Office" },
  { id: 3, x: 0.9, y: 0.1, room: "" },
];

describe("devices on a floor plan", () => {
  it("draws each asset as what it is, and leaves out what has no body", () => {
    expect(deviceKind({ type: "laptop", category: "end_user" })).toBe("laptop");
    expect(deviceKind({ type: "monitor", category: "end_user", screenInches: 24 })).toBe("monitor");
    expect(deviceKind({ type: "monitor", category: "communication", screenInches: 65 })).toBe("tv");
    expect(deviceKind({ type: "monitor", category: "communication", name: "MR-TV-01" })).toBe("tv");
    expect(deviceKind({ type: "access_point", category: "network" })).toBe("accessPoint");
    expect(deviceKind({ type: "cctv", category: "monitoring" })).toBe("camera");
    expect(deviceKind({ type: "virtual_server", category: "servers" })).toBeNull();
    expect(deviceKind({ type: "application", category: "software" })).toBeNull();
    // A type added since goes by its category.
    expect(deviceKind({ type: "thin_client", category: "end_user" })).toBe("desktop");
    expect(deviceKind({ type: "saas_tool", category: "cloud" })).toBeNull();
    expect(deviceKind({ type: "badge_printer", category: "other" })).toBe("other");
  });

  it("puts each where it was put, else in its room side by side, else at its wall point", () => {
    const { placed, unplaced } = placeDevices(
      [
        device(1, "Board Room", { planX: 0.11, planY: 0.12 }),
        device(2, "board room"),
        device(3, "Board Room"),
        device(4, "IT Office"),
        device(5, "", { outletId: 3 }),
        device(6, "Store room"),
      ],
      rooms,
      outlets,
    );
    const at = (id: number) => placed.find((p) => p.id === id)!;
    expect(at(1)).toMatchObject({ x: 0.11, y: 0.12, exact: true });
    // Two in the board room, under its name, apart.
    expect(at(2).exact).toBe(false);
    expect(at(2).y).toBeGreaterThan(0.3);
    expect(Math.abs(at(2).x - 0.2)).toBeLessThan(0.05);
    expect(at(2).x).not.toBe(at(3).x);
    // A room the drawing does not name, where its outlets are said to be.
    expect(at(4).x).toBeCloseTo(0.55 - 0.018, 3);
    // At its wall point.
    expect(at(5).x).toBeGreaterThan(0.9);
    expect(unplaced.map((d) => d.id)).toEqual([6]);
  });

  it("finds the room a spot is in by the nearest room name, near enough", () => {
    expect(roomAt(rooms, { x: 0.22, y: 0.33 })).toBe("Board Room");
    expect(roomAt(rooms, { x: 0.5, y: 0.5 })).toBeNull();
    expect(roomAt([], { x: 0.2, y: 0.3 })).toBeNull();
  });
});
