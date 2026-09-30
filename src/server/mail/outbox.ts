import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type { EmailKind } from "@/lib/domain";
import { db } from "../db";
import { emails } from "../db/schema";
import { notFound, one } from "../http";
import { getMailConfig, type MailConfig } from "./config";

/** A message failing this many times stays failed, and is shown so in the outbox. */
export const MAX_ATTEMPTS = 5;
/** A claimed message not finished in this time (the server stopped mid-send) is tried again. */
const STALE_MS = 5 * 60_000;
const BATCH = 20;

export type Message = { kind: EmailKind; to: string; subject: string; html: string; text: string; ticketId?: number | null };
export type Transport = { sendMail: (mail: SendMailOptions) => Promise<unknown> };

/** Connects to the mail server as Settings describe it: 587 with STARTTLS, 465 with TLS, or plain 25 for a relay. */
function smtpTransport(config: MailConfig): Transport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    auth: config.username ? { user: config.username, pass: config.password ?? "" } : undefined,
    // Exchange often presents a certificate from the company's own authority.
    tls: { rejectUnauthorized: !config.allowInvalidCert },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

let makeTransport: (config: MailConfig) => Transport = smtpTransport;
/** Tests stand in for the mail server here. */
export function useTransport(factory: (config: MailConfig) => Transport) {
  makeTransport = factory;
}

const sender = (config: MailConfig) => ({ name: config.fromName || "AP Plus IT", address: config.fromAddress });

/**
 * Puts messages in the outbox. With sending on they are delivered straight after, in the
 * background, so a slow or unreachable mail server never holds up the person's request;
 * the scheduler retries failures. With sending off they are held, for an admin to read.
 */
export async function queueEmail(messages: Message[]) {
  if (messages.length === 0) return;
  const config = await getMailConfig();
  await db.insert(emails).values(
    messages.map((m) => ({
      kind: m.kind,
      recipient: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      ticketId: m.ticketId ?? null,
      status: config.enabled ? ("pending" as const) : ("held" as const),
    })),
  );
  if (config.enabled) {
    deliverPending().catch((error) => console.error("Sending email failed:", error));
  }
}

/** Sends one claimed message and records how it went. */
async function deliver(row: typeof emails.$inferSelect, config: MailConfig, transport: Transport) {
  try {
    await transport.sendMail({
      from: sender(config),
      to: row.recipient,
      subject: row.subject,
      html: row.html,
      text: row.text,
    });
    await db.update(emails).set({ status: "sent", sentAt: new Date(), error: null }).where(eq(emails.id, row.id));
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(emails).set({ status: "failed", error: message.slice(0, 500) }).where(eq(emails.id, row.id));
    return { ok: false as const, error: message };
  }
}

/**
 * Sends what is waiting. Each message is claimed with a conditional update first, so two runs at
 * once (the scheduler and a request) never send the same one twice.
 */
export async function deliverPending(now = new Date()) {
  const config = await getMailConfig();
  if (!config.enabled) return 0;
  await db
    .update(emails)
    .set({ status: "failed", error: "Interrupted while sending" })
    .where(and(eq(emails.status, "sending"), lt(emails.lastAttemptAt, new Date(now.getTime() - STALE_MS))));

  const waiting = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(inArray(emails.status, ["pending", "failed"]), lt(emails.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(emails.id))
    .limit(BATCH);
  if (waiting.length === 0) return 0;

  const transport = makeTransport(config);
  let sent = 0;
  for (const { id } of waiting) {
    const [claimed] = await db
      .update(emails)
      .set({ status: "sending", attempts: sql`${emails.attempts} + 1`, lastAttemptAt: now })
      .where(and(eq(emails.id, id), inArray(emails.status, ["pending", "failed"])))
      .returning();
    if (!claimed) continue;
    if ((await deliver(claimed, config, transport)).ok) sent++;
  }
  return sent;
}

/** Sends a test straight away with the saved settings, whether or not sending is on, and says how it went. */
export async function sendTest(to: string, message: { subject: string; html: string; text: string }) {
  const config = await getMailConfig();
  if (!config.host || !config.fromAddress) return { ok: false as const, error: "Enter the mail server and the sender address, then save." };
  const row = one(
    await db
      .insert(emails)
      .values({ kind: "test", recipient: to, ...message, status: "sending", attempts: 1, lastAttemptAt: new Date() })
      .returning(),
  );
  return deliver(row, config, makeTransport(config));
}

/** The latest messages, newest first, without their bodies. */
export async function listOutbox(limit = 100) {
  return db
    .select({
      id: emails.id,
      kind: emails.kind,
      recipient: emails.recipient,
      subject: emails.subject,
      status: emails.status,
      attempts: emails.attempts,
      error: emails.error,
      ticketId: emails.ticketId,
      createdAt: emails.createdAt,
      sentAt: emails.sentAt,
    })
    .from(emails)
    .orderBy(desc(emails.id))
    .limit(limit);
}

export async function getEmail(id: number) {
  const [row] = await db.select().from(emails).where(eq(emails.id, id));
  if (!row) throw notFound();
  return row;
}
