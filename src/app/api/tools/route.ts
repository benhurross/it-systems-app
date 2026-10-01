import { handler, requireUser } from "@/server/http";
import { myTools } from "@/server/services/tools";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return myTools(user);
});
