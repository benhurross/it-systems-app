import { handler, requireUser } from "@/server/http";
import { toolsOverview } from "@/server/services/tools";

export const GET = handler(async () => {
  await requireUser("settings");
  return toolsOverview();
});
