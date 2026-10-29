"use client";

import { AreaGuard } from "@/components/app-shell/area-guard";
import { ArticleDialog } from "@/components/kb/article-dialog";
import { useRouter } from "@/i18n/navigation";
import KnowledgePage from "../page";

/** An address for a new article: the knowledge base, with the form open over it. */
export default function NewArticlePage() {
  const router = useRouter();
  return (
    <AreaGuard area="it">
      <KnowledgePage />
      <ArticleDialog onClose={() => router.replace("/knowledge")} />
    </AreaGuard>
  );
}
