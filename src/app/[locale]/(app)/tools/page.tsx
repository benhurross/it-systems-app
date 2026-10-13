"use client";

import { ArrowRight, Files, Lock, Presentation } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { PrivacyNote, TOOL_ICONS } from "@/components/tools/tool-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import type { MyTool } from "@/lib/api-types";
import { can } from "@/lib/permissions";
import { PDF_MODES } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * The tools the person may see: the PDF toolkit, each tool a way straight into its mode, and
 * Presentations. Tools that are off are not shown; one that needs approval shows a lock, and is
 * asked for inside.
 */
export default function ToolsPage() {
  const t = useTranslations("tools");
  const { data } = useApi<MyTool[]>("/tools");
  const admin = can(useCurrentUser().role, "settings");
  const modes = PDF_MODES.map((m) => ({ ...m, status: data?.find((s) => s.key === m.tool)?.status })).filter((m) => m.status && m.status !== "off");
  // Admins keep the slide library, so Presentations is always open to them.
  const presentations = admin ? "allowed" : data?.find((s) => s.key === "presentations")?.status;
  const showPresentations = !!presentations && presentations !== "off";

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("intro")} />
      {!data ? (
        <Skeleton className="h-80 w-full max-w-5xl" />
      ) : modes.length === 0 && !showPresentations ? (
        <p className="max-w-3xl rounded-xl border p-6 text-sm text-muted-foreground">{t("kit.none")}</p>
      ) : null}
      {data && showPresentations && <PresentationsCard status={presentations} />}
      {data && modes.length > 0 && (
        <section className="max-w-5xl overflow-hidden rounded-xl bg-card shadow-glass glass-sheen ring-1 ring-foreground/10" aria-labelledby="pdf-kit">
          <div className="flex flex-wrap items-center gap-4 border-b p-4 sm:p-5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Files className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <h2 id="pdf-kit" className="text-base font-medium">
                {t("cards.pdf_kit.name")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("cards.pdf_kit.description")}</p>
              <div className="mt-2">
                <PrivacyNote />
              </div>
            </div>
            <Button asChild>
              <Link href="/tools/pdf">
                {t("open")}
                <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3" aria-label={t("kit.choose")}>
            {modes.map(({ mode, tool, status }) => {
              const Icon = TOOL_ICONS[tool];
              const blocked = status === "blocked";
              const body = (
                <>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      {t(`kit.modes.${mode}`)}
                      {status !== "allowed" && <Lock className="size-3.5 text-muted-foreground" role="img" aria-label={t("kit.needsApproval")} />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{blocked ? t("kit.unavailable") : t(`kit.hints.${mode}`)}</span>
                  </span>
                </>
              );
              const box = "group flex h-full items-center gap-3 rounded-xl border p-3 transition-all";
              return (
                <li key={mode}>
                  {blocked ? (
                    <div className={cn(box, "opacity-60")}>{body}</div>
                  ) : (
                    <Link href={`/tools/pdf?mode=${mode}`} className={cn(box, "outline-none hover:border-primary/40 hover:bg-brand-soft/50 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50")}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Presentations: client decks made from the company's own slides. */
function PresentationsCard({ status }: { status: MyTool["status"] }) {
  const t = useTranslations("tools");
  const blocked = status === "blocked";
  return (
    <section className="flex max-w-5xl flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-glass glass-sheen ring-1 ring-foreground/10 sm:p-5" aria-labelledby="presentations-card">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Presentation className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <h2 id="presentations-card" className="flex items-center gap-1.5 text-base font-medium">
          {t("cards.presentations.name")}
          {status !== "allowed" && <Lock className="size-3.5 text-muted-foreground" role="img" aria-label={t("kit.needsApproval")} />}
        </h2>
        <p className="text-sm text-muted-foreground">{blocked ? t("kit.unavailable") : t("cards.presentations.description")}</p>
      </div>
      {!blocked && (
        <Button asChild>
          <Link href="/tools/presentations">
            {t("open")}
            <ArrowRight className="rtl:rotate-180" />
          </Link>
        </Button>
      )}
    </section>
  );
}
