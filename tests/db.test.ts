import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { settings } from "@/server/db/schema";
import { createTestDb } from "./helpers/db";

describe("database", () => {
  it("applies every migration and round-trips a row", async () => {
    const db = await createTestDb();
    await db.insert(settings).values({ key: "organisation", value: { name: "AP Plus" } });
    const [row] = await db.select().from(settings).where(eq(settings.key, "organisation"));
    expect(row.value).toEqual({ name: "AP Plus" });
  }, 120_000);
});
