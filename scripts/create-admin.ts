import { randomBytes } from "node:crypto";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ");
if (!email || !name) {
  console.error('Usage: npm run admin:create -- <email> "<Full Name>"');
  process.exit(1);
}

const password = randomBytes(12).toString("base64url");
await auth.api.createUser({ body: { email, name, password, role: "admin" } });
await db.$client.end();

console.log(`Admin created: ${email}`);
console.log(`One-time password: ${password}`);
console.log("Sign in and change it from the user menu.");
