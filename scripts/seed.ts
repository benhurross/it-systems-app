import { db } from "@/server/db";
import { seedReference } from "@/server/seed/reference";

await seedReference();
await db.$client.end();
console.log("Reference lists seeded.");
