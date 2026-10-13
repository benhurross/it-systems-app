import { presentationCreate } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createPresentation, listPresentations } from "@/server/services/presentations";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return listPresentations(user);
});

export const POST = handler(async (req) => {
  const user = await requireUser("request");
  return createPresentation(user, await body(req, presentationCreate));
});
