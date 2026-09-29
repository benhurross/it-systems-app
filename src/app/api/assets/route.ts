import { assetInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createAsset, listAssets } from "@/server/services/assets";

export const GET = handler(async () => {
  await requireUser("it");
  return listAssets();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createAsset(await body(req, assetInput), user);
});
