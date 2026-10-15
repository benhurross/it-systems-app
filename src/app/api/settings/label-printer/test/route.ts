import { handler, HttpError, requireUser } from "@/server/http";
import { testPrint } from "@/server/services/asset-tags";

/** A sample tag on the label printer; whether it went is part of the answer, as for a test email. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  try {
    await testPrint(new URL(req.url).origin, user);
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    throw error;
  }
});
