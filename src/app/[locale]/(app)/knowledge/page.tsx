"use client";

import { BookOpen, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import type { Article } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { can } from "@/lib/permissions";

const ALL = "__all";

export default function KnowledgePage() {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const user = useCurrentUser();
  const it = can(user.role, "it");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const { data = [], isLoading } = useApi<Article[]>("/kb");
  const today = isoDate();

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const articles = data.filter(
    (a) =>
      (category === ALL || a.category === category) &&
      words.every((w) => `${a.title} ${a.symptoms} ${a.resolution}`.toLowerCase().includes(w)),
  );

  return (
    <>
      <PageHeader
        title={t("kb.title")}
        description={t("kb.description")}
        actions={
          it && (
            <Button asChild>
              <Link href="/knowledge/new">
                <Plus />
                {t("kb.new")}
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("kb.search")}
            placeholder={t("kb.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label={t("kb.category")} className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("kb.allCategories")}</SelectItem>
            {lookups.options("kb_category").map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : articles.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("kb.empty")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((a) => (
            <Card key={a.id} className="relative transition-colors hover:border-primary/40">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone="brand">{lookups.label("kb_category", a.category)}</StatusBadge>
                  {it && a.status !== "published" && <EnumBadge kind="kbStatus" value={a.status} />}
                  {it && a.reviewDue && a.reviewDue < today && <StatusBadge tone="warning">{t("kb.reviewOverdue")}</StatusBadge>}
                </div>
                <CardTitle className="leading-snug">
                  <Link href={`/knowledge/${a.id}`} className="after:absolute after:inset-0 hover:text-primary">
                    {a.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.symptoms}</p>
                <p className="text-xs text-muted-foreground">{t("kb.updated", { date: format.date(a.updatedAt) })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
