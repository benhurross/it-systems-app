import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { SmtpSecurity } from "@/lib/domain";
import type { emailSettings } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { settings } from "../db/schema";
import { seal, unseal } from "./secret";

const KEY = "email";

type Stored = {
  enabled: boolean;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  /** Encrypted with the app's secret; see ./secret. */
  passwordSealed: string | null;
  fromName: string;
  fromAddress: string;
  appUrl: string;
  allowInvalidCert: boolean;
  retentionDays: number;
};

/** Off until an admin sets it up: messages are kept in the outbox rather than sent. */
const DEFAULTS: Stored = {
  enabled: false,
  host: "",
  port: 587,
  security: "starttls",
  username: "",
  passwordSealed: null,
  fromName: "AP Plus IT",
  fromAddress: "",
  appUrl: "",
  allowInvalidCert: false,
  retentionDays: 90,
};

async function stored(): Promise<Stored> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
  return { ...DEFAULTS, ...(row?.value as Partial<Stored> | undefined) };
}

/** The settings as the Settings page shows them: never the password, only whether one is saved. */
export async function getEmailSettings() {
  const { passwordSealed, ...rest } = await stored();
  return { ...rest, hasPassword: passwordSealed !== null };
}

/** The settings with the password readable, for connecting to the mail server. Server only. */
export async function getMailConfig() {
  const { passwordSealed, ...rest } = await stored();
  const password = passwordSealed ? unseal(passwordSealed) : null;
  // Links fall back to the address the app was started with, until one is set.
  return { ...rest, password, appUrl: rest.appUrl || (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "") };
}
export type MailConfig = Awaited<ReturnType<typeof getMailConfig>>;

export async function putEmailSettings(input: z.output<typeof emailSettings>, actor: Actor) {
  const current = await stored();
  const { password, ...rest } = input;
  // A blank password keeps the saved one; with no user name there is nothing to sign in with.
  const passwordSealed = !rest.username ? null : password ? seal(password) : current.passwordSealed;
  const value: Stored = { ...rest, passwordSealed };
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  await audit(actor, "update", "settings", KEY, `Changed email settings: sending ${rest.enabled ? "on" : "off"}`);
  return getEmailSettings();
}
