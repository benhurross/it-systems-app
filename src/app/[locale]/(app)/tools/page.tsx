"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { TOOL_ICONS, ToolAccess } from "@/components/tools/tool-page";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import type { MyTool } from "@/lib/api-types";
import { TOOLS } from "@/lib/tools";

/** Every tool the person may see: open ones to use, others to ask for. Tools that are off are not shown. */
export default function ToolsPage() {
  const t = useTranslations("tools");
  const { data } = useApi<MyTool[]>("/tools");

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <Skeleton key={tool.key} className="h-44" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <Alert className="max-w-3xl">
            <ShieldCheck />
            <AlertDescription>{t("privacy")}</AlertDescription>
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {TOOLS.map((tool) => {
              const status = data.find((s) => s.key === tool.key);
              if (!status || status.status === "off") return null;
              const Icon = TOOL_ICONS[tool.key];
              return (
                <Card key={tool.key}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-md bg-brand-soft text-brand">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {t(`names.${tool.key}`)}
                    </CardTitle>
                    <CardDescription>{t(`descriptions.${tool.key}`)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1" />
                  <CardFooter>
                    {status.status === "allowed" ? (
                      <Button asChild>
                        <Link href={tool.path}>{t("open")}</Link>
                      </Button>
                    ) : (
                      <ToolAccess tool={tool.key} status={status} />
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
