"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EnumBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { MyWorkstationCheck } from "@/lib/api-types";
import { cn } from "@/lib/utils";

/**
 * The person's own workstation checks, on their home page: each unread one in full, as the Windows
 * sign-in window shows it, with "I've read it"; the earlier ones as a short list.
 */
export function MyWorkstationChecks() {
  const t = useTranslations("workstation.mine");
  const tw = useTranslations("workstation");
  const format = useFormat();
  const { data = [] } = useApi<MyWorkstationCheck[]>("/me/workstation-checks");
  if (!data.length) return null;
  const unread = data.filter((c) => !c.readAt);
  const earlier = data.filter((c) => c.readAt).slice(0, 5);
  return (
    <div className="mb-6 space-y-4">
      {unread.map((c) => (
        <UnreadCheck key={c.id} check={c} />
      ))}
      {earlier.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {earlier.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {format.date(c.checkedAt)} · <span dir="ltr">{c.computerName}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <EnumBadge kind="workstationResult" value={c.result} />
                    <span className="text-xs text-muted-foreground">{tw("readOn", { date: format.date(c.readAt!) })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UnreadCheck({ check }: { check: MyWorkstationCheck }) {
  const t = useTranslations("workstation.mine");
  const locale = useLocale();
  const format = useFormat();
  const passed = check.result === "passed";
  const toFix = check.items.filter((i) => i.state === "not_ok");
  const read = useApiMutation(() => api(`/me/workstation-checks/${check.id}/read`, { method: "POST" }), { success: t("thanks") });
  const Icon = passed ? CheckCircle2 : TriangleAlert;
  return (
    <Card className={cn(passed ? "border-success/50" : "border-warning/60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={cn("size-5", passed ? "text-success" : "text-warning")} aria-hidden />
          {passed ? t("passedTitle") : t("attentionTitle")}
        </CardTitle>
        <CardDescription>{t("checked", { computer: check.computerName, date: format.date(check.checkedAt), by: check.checkedByName })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{passed ? t("passedText") : t("attentionText")}</p>
        {toFix.length > 0 && (
          <ul className="list-disc space-y-1 ps-5">
            {toFix.map((i) => (
              <li key={i.code}>
                <span className="font-medium">{locale === "ar" ? i.labelAr : i.labelEn}</span>
                {i.note && <span className="block text-muted-foreground">{i.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {check.message && (
          <blockquote className="border-s-2 ps-3 whitespace-pre-wrap" dir="auto">
            {check.message}
          </blockquote>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={() => read.mutate(undefined)} disabled={read.isPending}>
          {t("read")}
        </Button>
      </CardFooter>
    </Card>
  );
}
