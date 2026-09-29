import { contractInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createContract, listContracts } from "@/server/services/finance";

export const GET = handler(async () => {
  await requireUser("it");
  return listContracts();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createContract(await body(req, contractInput), user);
});
