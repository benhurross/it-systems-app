import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { accounts, sessions, users } from "@/server/db/schema";

// Gives an account a new password, for when nobody who can sign in is left to reset it in
// Settings → Users: npm run user:password -- <email> ["<new password>"]. Without a password, one
// is made up and shown. Wherever the account is signed in, it is signed out.
const [email, given] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run user:password -- <email> ["<new password>"]');
  process.exit(1);
}
if (given !== undefined && given.length < 10) {
  console.error("A password needs at least 10 characters.");
  process.exit(1);
}

const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim().toLowerCase()));
if (!user) {
  console.error(`No account has the email ${email}.`);
  await db.$client.end();
  process.exit(1);
}

const password = given ?? randomBytes(12).toString("base64url");
// Hashed the way sign-in checks it.
const hash = await (await auth.$context).password.hash(password);
const [credential] = await db
  .select({ id: accounts.id })
  .from(accounts)
  .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")));
if (credential) await db.update(accounts).set({ password: hash }).where(eq(accounts.id, credential.id));
else await db.insert(accounts).values({ id: randomUUID(), userId: user.id, providerId: "credential", accountId: user.id, password: hash });
await db.delete(sessions).where(eq(sessions.userId, user.id));
await db.$client.end();

console.log(`New password for ${email}: ${password}`);
console.log("Sign in with it, then change it from the user menu.");
