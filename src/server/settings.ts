import { eq } from "drizzle-orm";
import type { z } from "zod";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/monitor";
import { labelPrinterSettings, monitorSettings, organisationSettings, slaSettings, ticketSettings, toolSettings } from "@/lib/schemas";
import { DEFAULT_SLA } from "@/lib/sla";
import { audit, type Actor } from "./audit";
import { db } from "./db";
import { settings } from "./db/schema";

const SETTINGS = {
  sla: { schema: slaSettings, defaults: DEFAULT_SLA },
  monitoring: { schema: monitorSettings, defaults: DEFAULT_MONITOR_SETTINGS },
  organisation: { schema: organisationSettings, defaults: { name: "AP Plus", fiscalYearStartMonth: 1 } },
  tickets: { schema: ticketSettings, defaults: { autoCloseDays: 3 } },
  tools: { schema: toolSettings, defaults: {} },
  labelPrinter: { schema: labelPrinterSettings, defaults: { host: "", port: 9100, widthMm: 50, heightMm: 25, dpi: 203 as const, owner: "AP Plus IT" } },
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

/** The stored value, or the default when nothing has been saved. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row ? SETTINGS[key].schema.parse(row.value) : SETTINGS[key].defaults) as SettingValue<K>;
}

export async function putSetting<K extends SettingKey>(key: K, value: unknown, actor: Actor): Promise<SettingValue<K>> {
  const parsed = SETTINGS[key].schema.parse(value) as SettingValue<K>;
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed } });
  await audit(actor, "update", "settings", key, `Changed ${key} settings`);
  return parsed;
}

