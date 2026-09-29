import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("GETs by default and returns the JSON body", async () => {
    const fetch = respond(200, [{ id: 1 }]);
    vi.stubGlobal("fetch", fetch);
    expect(await api("/tickets")).toEqual([{ id: 1 }]);
    expect(fetch).toHaveBeenCalledWith("/api/tickets", { method: "GET", headers: undefined, body: undefined });
  });

  it("POSTs a body as JSON unless another method is named", async () => {
    const fetch = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetch);
    await api("/tickets", { body: { subject: "x" } });
    await api("/tickets/1", { method: "PATCH", body: { status: "open" } });
    expect(fetch.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].method)).toEqual(["POST", "PATCH"]);
  });

  it("throws the server's message and issues", async () => {
    vi.stubGlobal("fetch", respond(400, { error: "Invalid input", issues: [{ path: ["subject"], message: "Required" }] }));
    const error = await api("/tickets", { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "Invalid input", issues: [{ path: ["subject"] }] });
  });
});
