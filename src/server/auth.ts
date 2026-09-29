import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { ac, authRoles } from "@/lib/permissions";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
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
