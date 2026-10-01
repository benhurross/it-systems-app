"use client";

import { ArrowRight, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { CARD_ICONS, PrivacyNote, TOOL_ICONS, ToolAccess } from "@/components/tools/tool-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import type { MyTool } from "@/lib/api-types";
import { PDF_MODES, TOOL_CARDS } from "@/lib/tools";

/**
 * Every tool the person may see: open ones to use, others to ask for. Tools that are off are not
 * shown, nor the PDF toolkit when all of its tools are off.
 */
export default function ToolsPage() {
  const t = useTranslations("tools");
  const { data } = useApi<MyTool[]>("/tools");

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} actions={<PrivacyNote />} />
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOOL_CARDS.map((card) => (
            <Skeleton key={card.id} className="h-52" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOOL_CARDS.map((card) => {
            const statuses = card.tools.map((tool) => data.find((s) => s.key === tool)).filter((s) => s && s.status !== "off") as MyTool[];
            if (statuses.length === 0) return null;
            const Icon = CARD_ICONS[card.id];
            const kit = card.id === "pdf_kit";
            const single = kit ? null : statuses[0];
            // The toolkit opens while any of its tools can be used or asked for.
            const opens = kit ? statuses.some((s) => s.status !== "blocked") : single!.status === "allowed";
            return (
              <Card key={card.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <CardTitle className="text-base">{kit ? t("cards.pdf_kit.name") : t(`names.${single!.key}`)}</CardTitle>
                  <CardDescription>{kit ? t("cards.pdf_kit.description") : t(`descriptions.${single!.key}`)}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  {kit && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t("kit.choose")}>
                      {PDF_MODES.filter((m) => statuses.some((s) => s.key === m.tool)).map((m) => {
                        const ModeIcon = TOOL_ICONS[m.tool];
                        const locked = statuses.find((s) => s.key === m.tool)!.status !== "allowed";
                        return (
                          <li key={m.mode} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                            <ModeIcon className="size-3.5 text-brand" aria-hidden />
                            {t(`kit.modes.${m.mode}`)}
                            {locked && <Lock className="size-3 text-muted-foreground" role="img" aria-label={t("kit.needsApproval")} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
                <CardFooter>
                  {opens ? (
                    <Button asChild>
                      <Link href={card.path}>
                        {t("open")}
                        <ArrowRight className="rtl:rotate-180" />
                      </Link>
                    </Button>
                  ) : kit ? (
                    <p className="text-sm text-muted-foreground">{t("blocked")}</p>
                  ) : (
                    <ToolAccess tool={single!.key} status={single!} />
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
