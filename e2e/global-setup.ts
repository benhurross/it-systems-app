import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_DATABASE_URL } from "./env";

/** A fresh `ap_it_test` database for every run: dropped, created and migrated. */
export default async function globalSetup() {
  const admin = new Client({ connectionString: TEST_DATABASE_URL.replace(/\/ap_it_test$/, "/postgres") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS ap_it_test WITH (FORCE)");
  await admin.query("CREATE DATABASE ap_it_test");
  await admin.end();

  execSync("npx tsx scripts/migrate.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
