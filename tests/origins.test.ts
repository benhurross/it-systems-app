import { describe, expect, it } from "vitest";
import { parseOrigins } from "@/lib/origins";

describe("sign-in addresses", () => {
  it("reads a comma-separated list, forgiving spaces and trailing slashes", () => {
    expect(parseOrigins("http://localhost:3200, http://192.168.0.159:3200/ ,")).toEqual([
      "http://localhost:3200",
      "http://192.168.0.159:3200",
    ]);
  });

  it("joins several settings, first address first, without repeats", () => {
    expect(parseOrigins("http://localhost:3200", "http://localhost:3200,http://192.168.0.48:3200")).toEqual([
      "http://localhost:3200",
      "http://192.168.0.48:3200",
    ]);
  });

  it("treats a missing or empty setting as no addresses", () => {
    expect(parseOrigins(undefined, "")).toEqual([]);
  });
});
