import { z } from "zod";
import { IT_FORM_KINDS } from "@/lib/it-forms";
import { handler, requireUser } from "@/server/http";
import { itFormStart } from "@/server/services/it-forms";

/** What a new form of a kind starts with (?kind=credentials: the links and signer last used). */
export const GET = handler(async (req) => {
  await requireUser("it");
  return itFormStart(z.enum(IT_FORM_KINDS).parse(new URL(req.url).searchParams.get("kind")));
});
