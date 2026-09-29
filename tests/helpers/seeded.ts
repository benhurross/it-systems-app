import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

/** The fixed "now" the demo data is seeded against in tests: noon in Riyadh on 29 September 2026. */
export const NOW = new Date("2026-09-29T09:00:00Z");

/** A demo account as the session would present it. */
export async function asUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user as typeof user & { employeeId: number | null };
}
