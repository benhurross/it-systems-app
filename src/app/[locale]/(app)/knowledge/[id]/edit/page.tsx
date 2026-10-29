"use client";

import { use } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { ArticleDialog } from "@/components/kb/article-dialog";
import { useApi } from "@/hooks/use-api";
import { useRouter } from "@/i18n/navigation";
import type { Article } from "@/lib/api-types";
import ArticlePage from "../page";

/** An address for editing an article: the article, with the form open over it. */
export default function EditArticlePage(props: PageProps<"/[locale]/knowledge/[id]/edit">) {
  const { id } = use(props.params);
  const router = useRouter();
  const { data: article } = useApi<Article>(`/kb/${id}`);
  return (
    <AreaGuard area="it">
      <ArticlePage params={props.params} searchParams={props.searchParams} />
      {article && <ArticleDialog article={article} onClose={() => router.replace(`/knowledge/${id}`)} />}
    </AreaGuard>
  );
}
