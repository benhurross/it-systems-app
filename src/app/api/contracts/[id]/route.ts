import { contractInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteContract, updateContract } from "@/server/services/finance";

export const PATCH = handler(async (req, ctx: RouteContext<"/api/contracts/[id]">) => {
  const user = await requireUser("it");
  return updateContract(await idParam(ctx), await body(req, contractInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/contracts/[id]">) => {
  const user = await requireUser("it");
  return deleteContract(await idParam(ctx), user);
});
