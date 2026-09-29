"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { StatusBadge } from "@/components/status-badge";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Article } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { can } from "@/lib/permissions";

export default function ArticlePage({ params }: PageProps<"/[locale]/knowledge/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const user = useCurrentUser();
  const it = can(user.role, "it");
  const { data: article, isLoading } = useApi<Article>(`/kb/${id}`);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!article) return <StatusPage kind="notFound" home="/knowledge" />;

  const sections = [
    { title: t("kb.symptoms"), body: article.symptoms },
    { title: t("kb.cause"), body: article.cause },
    { title: t("kb.resolution"), body: article.resolution },
  ].filter((s) => s.body);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("kb.back")}
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground">{ref("article", article.id)}</span>
          <StatusBadge tone="brand">{lookups.label("kb_category", article.category)}</StatusBadge>
          {it && <EnumBadge kind="kbStatus" value={article.status} />}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
          {it && (
            <Button asChild variant="outline">
              <Link href={`/knowledge/${article.id}/edit`}>
                <Pencil />
                {t("kb.edit")}
              </Link>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("kb.updated", { date: format.date(article.updatedAt) })}
          {article.authorName && ` · ${article.authorName}`}
          {it && article.reviewDue && ` · ${t("kb.reviewDue")}: ${format.date(article.reviewDue)}`}
        </p>
      </header>
      {sections.map((s) => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle>{s.title}</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap leading-relaxed">{s.body}</CardContent>
        </Card>
      ))}
    </article>
  );
}
