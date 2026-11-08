import { itFormInput } from "@/lib/it-forms";
import { body, handler, idParam, requireUser } from "@/server/http";
import { deleteItForm, getItForm, updateItForm } from "@/server/services/it-forms";

export const GET = handler(async (_req, ctx: RouteContext<"/api/it-forms/[id]">) => {
  await requireUser("it");
  return getItForm(await idParam(ctx));
});

export const PUT = handler(async (req, ctx: RouteContext<"/api/it-forms/[id]">) => {
  const user = await requireUser("it");
  return updateItForm(await idParam(ctx), await body(req, itFormInput), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/it-forms/[id]">) => {
  const user = await requireUser("it");
  return deleteItForm(await idParam(ctx), user);
});
