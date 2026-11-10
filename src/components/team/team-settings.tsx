"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { TeamSettings } from "@/lib/team";

const KEYS = ["notifyAssigned", "notifyDone", "notifyDue", "notifyReturned"] as const;

/** Which emails Team Management sends; each switch saves at once. */
export function TeamSettingsCard() {
  const t = useTranslations("team.settings");
  const { data } = useApi<TeamSettings>("/team/settings");
  const save = useApiMutation((value: TeamSettings) => api<TeamSettings>("/team/settings", { method: "PUT", body: value }), { success: t("saved") });
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data
          ? KEYS.map((k) => <Skeleton key={k} className="h-6 w-full" />)
          : KEYS.map((k) => (
              <div key={k} className="flex items-start gap-3">
                <Switch id={`team-${k}`} checked={data[k]} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ ...data, [k]: v })} />
                <Label htmlFor={`team-${k}`} className="font-normal leading-snug">
                  {t(k)}
                </Label>
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
