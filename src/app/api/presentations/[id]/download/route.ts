import { z } from "zod";
import { handler, idParam, requireUser } from "@/server/http";
import { presentationFile } from "@/server/services/presentations";
import { fileResponse } from "../../respond";

/** The presentation as PowerPoint (?format=pptx, the default) or PDF (?format=pdf). */
export const GET = handler(async (req, ctx: RouteContext<"/api/presentations/[id]/download">) => {
  const user = await requireUser("request");
  const format = z.enum(["pptx", "pdf"]).catch("pptx").parse(new URL(req.url).searchParams.get("format"));
  return fileResponse(await presentationFile(user, await idParam(ctx), format));
});
