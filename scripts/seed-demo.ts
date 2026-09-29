import { db } from "@/server/db";
import { DEMO_ACCOUNTS } from "@/server/seed/demo-data";
import { seedDemo } from "@/server/seed/demo";

// Replaces everything in the database with demo data. Development and test databases only.
const counts = await seedDemo();
await db.$client.end();
console.log(`Demo data loaded: ${counts.employees} employees, ${counts.assets} assets, ${counts.tickets} tickets.`);
console.log(`Demo accounts: ${DEMO_ACCOUNTS.map((a) => a.email).join(", ")} (password in src/server/seed/demo.ts).`);
