import { employeeInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createEmployee, listEmployees } from "@/server/services/people";

export const GET = handler(async () => {
  await requireUser("it");
  return listEmployees();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createEmployee(await body(req, employeeInput), user);
});
