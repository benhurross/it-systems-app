import { z } from "zod";
import { ATTACHMENT_ENTITIES } from "@/lib/domain";
import { handler, requireUser } from "@/server/http";
import { attachmentCounts } from "@/server/services/attachments";

export const GET = handler(async (req) => {
  await requireUser("it");
  return attachmentCounts(z.enum(ATTACHMENT_ENTITIES).parse(new URL(req.url).searchParams.get("entity")));
});
