import { handler, requireUser } from "@/server/http";
import { networkStatus } from "@/server/services/monitoring";

export const GET = handler(async () => {
  await requireUser("it");
  return networkStatus();
});
