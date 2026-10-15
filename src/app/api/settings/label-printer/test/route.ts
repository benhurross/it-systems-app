import { handler, requireUser } from "@/server/http";
import { testPrint } from "@/server/services/asset-tags";

/** A sample tag on the label printer. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  await testPrint(new URL(req.url).origin, user);
  return { printed: 1 };
});
