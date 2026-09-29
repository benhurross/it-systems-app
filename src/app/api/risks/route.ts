import { riskInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createRisk, listRisks } from "@/server/services/risk";

export const GET = handler(async () => {
  await requireUser("it");
  return listRisks();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createRisk(await body(req, riskInput), user);
});
