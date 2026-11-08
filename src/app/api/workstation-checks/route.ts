import { z } from "zod";
import { workstationCheckInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createWorkstationCheck, listWorkstationChecks } from "@/server/services/workstation-checks";

const filter = z.object({ assetId: z.coerce.number().int().positive().optional(), employeeId: z.coerce.number().int().positive().optional() });

/** Every check, or one computer's (?assetId=) or one person's (?employeeId=). */
export const GET = handler(async (req) => {
  await requireUser("it");
  return listWorkstationChecks(filter.parse(Object.fromEntries(new URL(req.url).searchParams)));
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createWorkstationCheck(await body(req, workstationCheckInput), user);
});
