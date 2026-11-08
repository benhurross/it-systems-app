import { handler, requireUser } from "@/server/http";
import { listSightings } from "@/server/services/device-sightings";

/** The PCs seen at sign-in, with their assets and what differs. */
export const GET = handler(async () => {
  await requireUser("it");
  return listSightings();
});
