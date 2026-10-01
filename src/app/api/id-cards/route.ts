import { idCardCreate } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createCard, listCards } from "@/server/services/id-cards";

export const GET = handler(async () => {
  await requireUser("it");
  return listCards();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createCard(await body(req, idCardCreate), user);
});
