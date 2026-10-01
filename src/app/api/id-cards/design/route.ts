import { handler, requireUser } from "@/server/http";
import { designInfo } from "@/server/services/id-cards";

export const GET = handler(async () => {
  await requireUser("request");
  return designInfo();
});
