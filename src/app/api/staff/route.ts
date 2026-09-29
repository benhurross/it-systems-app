import { handler, requireUser } from "@/server/http";
import { listStaff } from "@/server/services/people";

/** Admins and IT staff, for assignment pickers. */
export const GET = handler(async () => {
  await requireUser("it");
  return listStaff();
});
