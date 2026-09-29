import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const user = vi.hoisted(() => ({ current: null as null | { id: string; role: string } }));
vi.mock("@/server/current-user", () => ({ currentUser: async () => user.current }));

const { handler, HttpError, requireUser } = await import("@/server/http");

const call = (fn: () => Promise<unknown>) => handler(fn)(new Request("http://test/api"), undefined);

describe("requireUser", () => {
  beforeEach(() => {
    user.current = null;
  });

  it("answers 401 when nobody is signed in", async () => {
    const res = await call(() => requireUser("it"));
    expect(res.status).toBe(401);
  });

  it("answers 403 when the role does not reach the area", async () => {
    user.current = { id: "u1", role: "it_staff" };
    const res = await call(() => requireUser("settings"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not allowed" });
  });

  it("returns the user when the role reaches the area", async () => {
    user.current = { id: "u1", role: "admin" };
    const res = await call(() => requireUser("settings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "u1" });
  });
});

describe("handler", () => {
  it("returns plain values as JSON", async () => {
    const res = await call(async () => ({ ok: true }));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("passes a Response through untouched", async () => {
    const res = await call(async () => new Response(null, { status: 204 }));
    expect(res.status).toBe(204);
  });

  it("maps HttpError to its status", async () => {
    const res = await call(async () => {
      throw new HttpError(404, "Not found");
    });
    expect(res.status).toBe(404);
  });

  it("maps validation failures to 400 with the issues", async () => {
    const res = await call(async () => z.object({ name: z.string().min(1) }).parse({ name: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.issues[0].path).toEqual(["name"]);
  });

  it("lets unexpected errors surface", async () => {
    await expect(
      call(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
