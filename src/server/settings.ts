import { eq } from "drizzle-orm";
import type { z } from "zod";
import { DEFAULT_KPI_TARGETS, type KpiTargets } from "@/lib/kpis";
import { DEFAULT_MONITOR_SETTINGS } from "@/lib/monitor";
import { monitorSettings, organisationSettings, slaSettings, ticketSettings, toolSettings } from "@/lib/schemas";
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

const KPI_KEY = "kpi_targets";

/** Baselines and targets for a year; the workbook's figures until an admin sets that year. */
export async function getKpiTargets(year: number): Promise<KpiTargets> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KPI_KEY));
  return (row?.value as Record<string, KpiTargets> | undefined)?.[year] ?? DEFAULT_KPI_TARGETS;
}

export async function putKpiTargets(year: number, targets: KpiTargets, actor: Actor) {
  const [row] = await db.select().from(settings).where(eq(settings.key, KPI_KEY));
  const value = { ...((row?.value as Record<string, KpiTargets>) ?? {}), [year]: targets };
  await db
    .insert(settings)
    .values({ key: KPI_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await audit(actor, "update", "settings", KPI_KEY, `Changed KPI targets for ${year}`);
}
