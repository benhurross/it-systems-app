import { handler, requireUser } from "@/server/http";
import { listRooms } from "@/server/services/floor-plans";

/** The rooms an asset can be put in, from the floor plans and what was written before. */
export const GET = handler(async () => {
  await requireUser("it");
  return listRooms();
});
