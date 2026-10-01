import { handler, requireUser } from "@/server/http";
import { myCard } from "@/server/services/id-cards";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return myCard(user);
});
