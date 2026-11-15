import { handler, notFound, requireUser } from "@/server/http";
import { forgetRules } from "@/server/sessions";
import { getSetting, putSetting, type SettingKey } from "@/server/settings";

const KEYS: SettingKey[] = ["sla", "monitoring", "organisation", "tickets", "tools", "labelPrinter", "security"];

async function settingKey(ctx: RouteContext<"/api/settings/[key]">): Promise<SettingKey> {
  const { key } = await ctx.params;
  if (!KEYS.includes(key as SettingKey)) throw notFound();
  return key as SettingKey;
}

export const GET = handler(async (_req, ctx: RouteContext<"/api/settings/[key]">) => {
  await requireUser("settings");
  return getSetting(await settingKey(ctx));
});

export const PUT = handler(async (req, ctx: RouteContext<"/api/settings/[key]">) => {
  const user = await requireUser("settings");
  const key = await settingKey(ctx);
  const saved = await putSetting(key, await req.json(), user);
  // New sign-in rules apply at once.
  if (key === "security") forgetRules();
  return saved;
});
