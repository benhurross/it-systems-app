import { describe, expect, it } from "vitest";
import ar from "../messages/ar.json";
import en from "../messages/en.json";

/** Every message as [dotted.key, text]. */
function flatten(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" ? flatten(child, path) : [[path, String(child)] as [string, string]];
  });
}

// A placeholder is a name closed by "}" or followed by ","; the words inside a select branch are not.
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("messages", () => {
  const english = new Map(flatten(en));
  const arabic = new Map(flatten(ar));

  it("has the same keys in English and Arabic", () => {
    expect([...arabic.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it("uses the same placeholders in both languages", () => {
    for (const [key, text] of english) {
      expect(placeholders(arabic.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("has no empty messages", () => {
    for (const [key, text] of [...english, ...arabic]) expect(text.trim(), key).not.toBe("");
  });
});
