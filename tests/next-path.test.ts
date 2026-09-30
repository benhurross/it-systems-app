import { describe, expect, it } from "vitest";
import { safeNext, signInFor } from "@/lib/next-path";

describe("returning after sign-in", () => {
  it("keeps a path inside the app, with its query", () => {
    expect(safeNext("/tickets/12/assign?to=me")).toBe("/tickets/12/assign?to=me");
    expect(signInFor("/tickets/12/assign?to=me")).toBe("/sign-in?next=%2Ftickets%2F12%2Fassign%3Fto%3Dme");
    expect(signInFor("/")).toBe("/sign-in");
  });

  it("ignores anything that could lead to another site", () => {
    for (const bad of ["https://evil.test/x", "//evil.test/x", "/\\evil.test", "javascript:alert(1)", "", null, undefined, "tickets"]) {
      expect(safeNext(bad)).toBeNull();
    }
    expect(signInFor("//evil.test")).toBe("/sign-in");
  });
});
