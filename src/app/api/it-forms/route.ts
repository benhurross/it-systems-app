import { z } from "zod";
import { IT_FORM_KINDS, itFormInput } from "@/lib/it-forms";
import { body, handler, requireUser } from "@/server/http";
import { createItForm, listItForms } from "@/server/services/it-forms";

const filter = z.object({ employeeId: z.coerce.number().int().positive().optional(), kind: z.enum(IT_FORM_KINDS).optional() });

export const GET = handler(async (req) => {
  await requireUser("it");
  return listItForms(filter.parse(Object.fromEntries(new URL(req.url).searchParams)));
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createItForm(await body(req, itFormInput), user);
});
