import { describe, expect, it } from "vitest";
import { readTableUrl, writeTableUrl, type TableUrlState } from "@/lib/table-url";

const columns = { facets: ["status", "department"], date: "createdAt" };
const empty: TableUrlState = { q: "", facets: {}, dates: {}, sort: null, page: 0 };

describe("a list's state in the address", () => {
  it("is written and read back the same", () => {
    const state: TableUrlState = {
      q: "nora al",
      facets: { status: ["current"], department: ["it", "finance"] },
      dates: { createdAt: { from: "2026-01-01", to: "2026-03-31" } },
      sort: { id: "name", desc: true },
      page: 2,
    };
    const query = writeTableUrl("", state);
    expect(query).toBe("?q=nora+al&f.status=current&f.department=it&f.department=finance&d.createdAt=2026-01-01%7E2026-03-31&sort=-name&page=3");
    expect(readTableUrl(query, columns)).toEqual(state);
  });

  it("keeps a relative date range as such, and other parameters of the address", () => {
    const query = writeTableUrl("?plan=4&q=old", { ...empty, dates: { createdAt: { from: "2026-10-01", to: "2026-10-30", preset: "last30" } } });
    expect(query).toBe("?plan=4&d.createdAt=last30");
    expect(readTableUrl(query, columns).dates.createdAt).toEqual({ from: null, to: null, preset: "last30" });
  });

  it("leaves an untouched list with a plain address, and notes a sort turned off", () => {
    const initialSort = { id: "createdAt", desc: true };
    expect(writeTableUrl("", { ...empty, sort: initialSort }, initialSort)).toBe("");
    expect(writeTableUrl("", empty, initialSort)).toBe("?sort=none");
    expect(writeTableUrl("", empty)).toBe("");
  });

  it("ignores what the list does not have, and nonsense", () => {
    const read = readTableUrl("?f.secret=x&f.status=&d.createdAt=garbage&page=-4&sort=", columns);
    expect(read).toEqual(empty);
    expect(readTableUrl("?sort=-hacked", { ...columns, sortable: (id) => id === "name" }).sort).toBeNull();
  });
});
