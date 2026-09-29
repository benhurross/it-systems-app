"use client";

import { useTranslations } from "next-intl";
import { use } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { ArticleForm } from "@/components/kb/article-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import type { Article } from "@/lib/api-types";

export default function EditArticlePage({ params }: PageProps<"/[locale]/knowledge/[id]/edit">) {
  const { id } = use(params);
  const t = useTranslations("kb");
  const { data: article } = useApi<Article>(`/kb/${id}`);
  return (
    <AreaGuard area="it">
      <PageHeader title={t("edit")} />
      {article ? <ArticleForm article={article} /> : <Skeleton className="h-96 max-w-3xl" />}
    </AreaGuard>
  );
}
