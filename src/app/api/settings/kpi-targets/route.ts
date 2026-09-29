import { z } from "zod";
import { kpiTargetsInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { getKpiTargets, putKpiTargets } from "@/server/settings";

export const GET = handler(async (req) => {
  await requireUser("settings");
  const year = z.coerce.number().int().parse(new URL(req.url).searchParams.get("year"));
  return getKpiTargets(year);
});

export const PUT = handler(async (req) => {
  const user = await requireUser("settings");
  const { year, targets } = await body(req, kpiTargetsInput);
  await putKpiTargets(year, targets, user);
  return getKpiTargets(year);
});
