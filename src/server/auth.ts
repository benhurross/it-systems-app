import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { parseOrigins } from "@/lib/origins";
import { ac, authRoles } from "@/lib/permissions";
import { db } from "./db";
import * as schema from "./db/schema";

// The app's own address, then the others people may sign in from, such as this computer's address
// on the office network. Either setting may list several; the first address is the app's own.
const [baseURL, ...otherOrigins] = parseOrigins(process.env.BETTER_AUTH_URL, process.env.BETTER_AUTH_TRUSTED_ORIGINS);

export const auth = betterAuth({
  baseURL,
  trustedOrigins: otherOrigins,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  // Accounts are created by admins in Settings; nobody signs themselves up.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  // Production allows three sign-in attempts per ten seconds per address. The end-to-end suite signs
  // many people in from one address, so its server sets AUTH_RATE_LIMIT=off; nothing else should.
  rateLimit: { enabled: process.env.AUTH_RATE_LIMIT === "off" ? false : undefined },
  user: {
    additionalFields: {
      employeeId: { type: "number", required: false, input: false },
    },
  },
  plugins: [admin({ ac, roles: authRoles, defaultRole: "employee", adminRoles: ["admin"] })],
});

export type SessionUser = typeof auth.$Infer.Session.user;
