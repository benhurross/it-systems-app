import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import type { respondInput } from "@/lib/schemas";
import { audit } from "../audit";
import { db } from "../db";
import { emailLinks, employees, ticketComments, tickets, users } from "../db/schema";
import { HttpError, notFound } from "../http";
import { getSetting } from "../settings";

const DAY_MS = 86_400_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** When a resolved ticket closes by itself if its requester does not answer. */
export async function autoCloseAt(resolvedAt: Date) {
  const { autoCloseDays } = await getSetting("tickets");
  return new Date(resolvedAt.getTime() + autoCloseDays * DAY_MS);
}

/**
 * A link for the requester to answer "is it fixed?" without signing in, valid until the ticket
 * would close by itself. Any earlier link for the ticket stops working. Only the token's hash is kept.
 */
export async function createResolutionLink(ticketId: number, employeeId: number, expiresAt: Date, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await db
    .update(emailLinks)
    .set({ expiresAt: now })
    .where(and(eq(emailLinks.ticketId, ticketId), isNull(emailLinks.usedAt)));
  await db.insert(emailLinks).values({ tokenHash: hash(token), kind: "resolution", ticketId, employeeId, expiresAt });
  return token;
}

export type LinkState = "open" | "used" | "expired" | "answered";

async function findLink(token: string) {
  const [row] = await db
    .select({ link: emailLinks, ticket: tickets, requesterName: employees.name })
    .from(emailLinks)
    .innerJoin(tickets, eq(tickets.id, emailLinks.ticketId))
    .innerJoin(employees, eq(employees.id, emailLinks.employeeId))
    .where(eq(emailLinks.tokenHash, hash(token)));
  if (!row) throw notFound();
  return row;
}

function stateOf(row: Awaited<ReturnType<typeof findLink>>, now: Date): LinkState {
  if (row.link.usedAt) return "used";
  // Answered in the app, closed by itself, or reopened by IT: nothing left to answer here.
  if (row.ticket.status !== "resolved") return "answered";
  if (row.link.expiresAt <= now) return "expired";
  return "open";
}

/** What the answer page shows: the request, IT's note, and whether the link still works. Nothing more. */
export async function readLink(token: string, now = new Date()) {
  const row = await findLink(token);
  return {
    ref: ref("ticket", row.ticket.id),
    subject: row.ticket.subject,
    resolution: row.ticket.resolution,
    name: row.requesterName,
    state: stateOf(row, now),
  };
}

/**
 * Closes the ticket (with an optional rating) or reopens it (with the reason as a comment), as the
 * requester. The link is claimed inside the same transaction, so it can only ever be used once.
 */
export async function answerLink(token: string, input: z.infer<typeof respondInput>, now = new Date()) {
  const row = await findLink(token);
  if (stateOf(row, now) !== "open") throw new HttpError(409, "This link can no longer be used");
  const ticketId = row.ticket.id;
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.employeeId, row.link.employeeId)).limit(1);
  const actor = { id: account?.id ?? null, name: row.requesterName };

  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(emailLinks)
      .set({ usedAt: now })
      .where(and(eq(emailLinks.id, row.link.id), isNull(emailLinks.usedAt)))
      .returning({ id: emailLinks.id });
    const stillResolved = and(eq(tickets.id, ticketId), eq(tickets.status, "resolved"));
    const updated =
      input.answer === "fixed"
        ? await tx.update(tickets).set({ status: "closed", closedAt: now, satisfaction: input.rating ?? null }).where(stillResolved).returning({ id: tickets.id })
        : await tx
            .update(tickets)
            .set({ status: "open", reopenCount: sql`${tickets.reopenCount} + 1`, resolvedAt: null, closedAt: null, satisfaction: null })
            .where(stillResolved)
            .returning({ id: tickets.id });
    if (claimed.length === 0 || updated.length === 0) throw new HttpError(409, "This link can no longer be used");
    if (input.answer === "not_fixed") {
      await tx.insert(ticketComments).values({ ticketId, authorId: actor.id, authorName: actor.name, body: input.reason, createdAt: now });
    }
  });

  const notes = input.answer === "fixed" ? ["status closed", ...(input.rating ? [`rated ${input.rating}/5`] : [])] : ["status open", "reason added"];
  await audit(actor, "update", "ticket", ticketId, `Updated ${ref("ticket", ticketId)} by email: ${notes.join(", ")}`);
  return readLink(token, now);
}

/** Closes resolved tickets whose requester has not answered in time. Returns how many it closed. */
export async function autoCloseResolved(now = new Date()) {
  const { autoCloseDays } = await getSetting("tickets");
  const closed = await db
    .update(tickets)
    .set({ status: "closed", closedAt: now })
    .where(and(eq(tickets.status, "resolved"), lte(tickets.resolvedAt, new Date(now.getTime() - autoCloseDays * DAY_MS))))
    .returning({ id: tickets.id });
  for (const { id } of closed) {
    await audit(null, "update", "ticket", id, `Updated ${ref("ticket", id)}: status closed (no answer in ${autoCloseDays} days)`);
  }
  return closed.length;
}
