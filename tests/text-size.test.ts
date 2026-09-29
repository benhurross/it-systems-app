import { describe, expect, it } from "vitest";
import { DEFAULT_TEXT_SIZE, parseTextSize, stepTextSize, TEXT_SIZE_SCRIPT, TEXT_SIZES } from "@/lib/text-size";

describe("text size", () => {
  it("offers five steps around 100%", () => {
    expect(TEXT_SIZES).toEqual([87.5, 100, 112.5, 125, 137.5]);
    expect(DEFAULT_TEXT_SIZE).toBe(100);
  });

  it("steps up and down and stops at either end", () => {
    expect(stepTextSize(100, 1)).toBe(112.5);
    expect(stepTextSize(100, -1)).toBe(87.5);
    expect(stepTextSize(137.5, 1)).toBe(137.5);
    expect(stepTextSize(87.5, -1)).toBe(87.5);
  });

  it("reads a stored step and falls back to the default for anything else", () => {
    expect(parseTextSize("125")).toBe(125);
    expect(parseTextSize(null)).toBe(100);
    expect(parseTextSize("300")).toBe(100);
    expect(parseTextSize("abc")).toBe(100);
  });

  it("ships a pre-paint script that knows every step", () => {
    expect(TEXT_SIZE_SCRIPT).toContain("87.5,100,112.5,125,137.5");
    expect(TEXT_SIZE_SCRIPT).toContain('localStorage.getItem("text-size")');
  });
});
