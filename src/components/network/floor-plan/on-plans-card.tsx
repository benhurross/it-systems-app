"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import type { AssetOnPlans } from "@/lib/api-types";
import { outletName } from "./dialogs";

/** Where an asset is on the floor plans: the wall ports it is plugged into, or the switch it is. */
export function OnPlansCard({ assetId }: { assetId: number }) {
  const t = useTranslations("floorPlan.onPlans");
  const { data } = useApi<AssetOnPlans>(`/assets/${assetId}/floor-plans`);
  if (!data) return null;
  const none = !data.outlets.length && !data.asSwitch.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {data.outlets.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("plugged", { label: outletName(o), plan: o.planName, room: o.room || "none" })}</span>
              <Link href={`/network/floor-plan?plan=${o.planId}&outlet=${o.id}`} className="font-medium text-primary hover:underline">
                {t("show")}
              </Link>
            </li>
          ))}
          {data.asSwitch.map((s) => (
            <li key={`${s.planId}-${s.switchNo}`} className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("asSwitch", { number: s.switchNo, plan: s.planName })}</span>
              <Link href={`/network/floor-plan?plan=${s.planId}&find=S${s.switchNo}`} className="font-medium text-primary hover:underline">
                {t("show")}
              </Link>
            </li>
          ))}
          {none && <li className="text-muted-foreground">{t("none")}</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
