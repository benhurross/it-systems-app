import { handler, idParam, notFound, requireUser } from "@/server/http";
import { deleteImpact, IMPACT_KINDS, type ImpactKind } from "@/server/services/impact";

/** What deleting a record would delete with it, and what would lose its link to it: for the confirmation. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/impact/[kind]/[id]">) => {
  await requireUser("it");
  const { kind } = await ctx.params;
  if (!(IMPACT_KINDS as readonly string[]).includes(kind)) throw notFound();
  return deleteImpact(kind as ImpactKind, await idParam(ctx));
});
