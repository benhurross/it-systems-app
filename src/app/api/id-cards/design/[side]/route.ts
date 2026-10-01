import { z } from "zod";
import { CARD_SIDES } from "@/lib/id-card";
import { badRequest, handler, notFound, requireUser } from "@/server/http";
import { designImage, removeDesign, setDesign } from "@/server/services/id-cards";
import { imageResponse } from "../../image-response";

const sideOf = async (ctx: RouteContext<"/api/id-cards/design/[side]">) => {
  const parsed = z.enum(CARD_SIDES).safeParse((await ctx.params).side);
  if (!parsed.success) throw notFound();
  return parsed.data;
};

/** The design image. Pages ask for it with ?v= its upload time, so it can be kept until replaced. */
export const GET = handler(async (req, ctx: RouteContext<"/api/id-cards/design/[side]">) => {
  await requireUser("request");
  const image = await designImage(await sideOf(ctx));
  if (!image) throw notFound();
  const versioned = new URL(req.url).searchParams.has("v");
  return imageResponse(image, versioned ? "private, max-age=31536000, immutable" : "private, no-cache");
});

/** A multipart form with the image. */
export const PUT = handler(async (req, ctx: RouteContext<"/api/id-cards/design/[side]">) => {
  const user = await requireUser("settings");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw badRequest("fileEmpty");
  return setDesign(await sideOf(ctx), new Uint8Array(await file.arrayBuffer()), user);
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/api/id-cards/design/[side]">) => {
  const user = await requireUser("settings");
  return removeDesign(await sideOf(ctx), user);
});
