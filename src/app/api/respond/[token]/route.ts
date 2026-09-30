import { respondInput } from "@/lib/schemas";
import { body, handler } from "@/server/http";
import { answerLink, readLink } from "@/server/services/respond";

// No sign-in here: the token in the link is the permission. It is long, random, stored only as a
// hash, works once and for one ticket, and expires when the ticket would close by itself.

export const GET = handler(async (_req, ctx: RouteContext<"/api/respond/[token]">) => {
  return readLink((await ctx.params).token);
});

export const POST = handler(async (req, ctx: RouteContext<"/api/respond/[token]">) => {
  return answerLink((await ctx.params).token, await body(req, respondInput));
});
