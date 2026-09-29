import { handler, requireUser } from "@/server/http";
import { listAlerts } from "@/server/services/monitoring";

export const GET = handler(async () => {
  await requireUser("it");
  return listAlerts();
});
