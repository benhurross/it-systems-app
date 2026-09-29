import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const db = drizzle(process.env.DATABASE_URL!);
await migrate(db, { migrationsFolder: "drizzle" });
await db.$client.end();
console.log("Migrations applied.");
