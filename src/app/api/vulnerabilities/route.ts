import { vulnerabilityInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createVulnerability, listVulnerabilities } from "@/server/services/risk";

export const GET = handler(async () => {
  await requireUser("it");
  return listVulnerabilities();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createVulnerability(await body(req, vulnerabilityInput), user);
});
