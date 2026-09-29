import { z } from "zod";
import { budgetInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { budgetSummary, setBudget } from "@/server/services/finance";

/** The fiscal year's budget lines; the current year unless `?year=` names another. */
export const GET = handler(async (req) => {
  await requireUser("it");
  const year = new URL(req.url).searchParams.get("year");
  return budgetSummary(year ? z.coerce.number().int().parse(year) : undefined);
});

export const PUT = handler(async (req) => {
  const user = await requireUser("it");
  return setBudget(await body(req, budgetInput), user);
});
