import { handler, requireUser } from "@/server/http";
import { dashboard } from "@/server/services/dashboard";

export const GET = handler(async () => {
  await requireUser("it");
  return dashboard();
});
