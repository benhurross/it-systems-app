import { handler, requireUser } from "@/server/http";
import { mySummary } from "@/server/services/me";

export const GET = handler(async () => {
  const user = await requireUser("request");
  return mySummary(user);
});
