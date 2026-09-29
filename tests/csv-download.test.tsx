import { describe, expect, it, vi } from "vitest";
import { downloadCsv } from "@/lib/csv";

describe("downloadCsv", () => {
  it("saves the text with a byte-order mark so Excel reads Arabic", async () => {
    let saved: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return "blob:csv";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("assets.csv", "Name\r\nحاسب");

    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
    const bytes = new Uint8Array(await saved!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(saved!.type).toBe("text/csv;charset=utf-8");
  });
});
