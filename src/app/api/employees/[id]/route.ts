import { employeeInput } from "@/lib/schemas";
import { body, handler, idParam, requireUser } from "@/server/http";
import { employeeProfile, updateEmployee } from "@/server/services/people";

export const GET = handler(async (_req, ctx: RouteContext<"/api/employees/[id]">) => {
  await requireUser("it");
  return employeeProfile(await idParam(ctx));
});

export const PATCH = handler(async (req, ctx: RouteContext<"/api/employees/[id]">) => {
  const user = await requireUser("it");
  return updateEmployee(await idParam(ctx), await body(req, employeeInput), user);
});
