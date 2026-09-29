"use client";

import { useTranslations } from "next-intl";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { ArticleForm } from "@/components/kb/article-form";
import { PageHeader } from "@/components/page-header";

export default function NewArticlePage() {
  const t = useTranslations("kb");
  return (
    <AreaGuard area="it">
      <PageHeader title={t("new")} />
      <ArticleForm />
    </AreaGuard>
  );
}
