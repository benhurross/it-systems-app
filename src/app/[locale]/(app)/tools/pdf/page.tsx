"use client";

import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useState } from "react";
import { useNoStrayDrops } from "@/components/tools/files";
import { ImagesPanel } from "@/components/tools/pdf-kit/images";
import { MergePanel } from "@/components/tools/pdf-kit/merge";
import { OrganizePanel } from "@/components/tools/pdf-kit/organize";
import { SplitPanel } from "@/components/tools/pdf-kit/split";
import { StampPanel } from "@/components/tools/pdf-kit/stamp";
import { WordPanel } from "@/components/tools/pdf-kit/word";
import { AllToolsLink, PrivacyNote, TOOL_ICONS, ToolAccess } from "@/components/tools/tool-page";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import type { MyTool } from "@/lib/api-types";
import { PDF_MODES, type PdfMode } from "@/lib/tools";
import { cn } from "@/lib/utils";

const PANELS = { merge: MergePanel, split: SplitPanel, organize: OrganizePanel, word: WordPanel, images: ImagesPanel, stamp: StampPanel } as const;

/**
 * Every PDF tool in one place: Merge, Split, Organize, PDF to Word, Images to PDF, and Page
 * numbers and watermark. Each mode is a tool of its own for who may
 * use it: one that needs approval shows a lock and the way to ask; one that is off is not shown.
 * Each mode keeps its work while another is open.
 */
export default function PdfToolkitPage() {
  const t = useTranslations("tools");
  const { data } = useApi<MyTool[]>("/tools");
  const asked = useSearchParams().get("mode");
  const [chosen, setChosen] = useState<PdfMode | null>(null);
  useNoStrayDrops();

  const modes = PDF_MODES.map((m) => ({ ...m, status: data?.find((s) => s.key === m.tool) })).filter((m) => m.status && m.status.status !== "off");
  const current = modes.find((m) => m.mode === chosen) ?? modes.find((m) => m.mode === asked) ?? modes[0];
  const choose = (mode: string) => {
    setChosen(mode as PdfMode);
    // The address says which mode is open, for a link or a reload.
    window.history.replaceState(null, "", `?mode=${mode}`);
  };

  return (
    <div className="space-y-6">
      <AllToolsLink />
      <PageHeader title={t("cards.pdf_kit.name")} description={t("cards.pdf_kit.description")} actions={<PrivacyNote />} />
      {!data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {PDF_MODES.map((m) => (
            <Skeleton key={m.mode} className="h-20" />
          ))}
        </div>
      ) : !current ? (
        <p className="max-w-3xl rounded-xl border p-6 text-sm text-muted-foreground">{t("kit.none")}</p>
      ) : (
        <TabsPrimitive.Root value={current.mode} onValueChange={choose} className="space-y-6">
          <TabsPrimitive.List aria-label={t("kit.choose")} className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3">
            {modes.map(({ mode, tool, status }) => {
              const Icon = TOOL_ICONS[tool];
              const locked = status!.status !== "allowed";
              return (
                <TabsPrimitive.Trigger
                  key={mode}
                  value={mode}
                  className={cn(
                    "group flex min-w-0 flex-col items-start gap-2 rounded-xl border bg-card p-3 text-start shadow-glass transition-all outline-none sm:flex-row sm:gap-3 sm:p-4",
                    "hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "data-[state=active]:border-primary data-[state=active]:bg-brand-soft",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 self-stretch">
                    <span className="block font-medium">{t(`kit.modes.${mode}`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`kit.hints.${mode}`)}</span>
                    {locked && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Lock className="size-3" aria-hidden />
                        {status!.status === "requested" ? t("kit.requested") : status!.status === "approval" ? t("kit.needsApproval") : t("kit.unavailable")}
                      </span>
                    )}
                  </span>
                </TabsPrimitive.Trigger>
              );
            })}
          </TabsPrimitive.List>
          {modes.map(({ mode, tool, status }) => {
            const Panel = PANELS[mode];
            return (
              <TabsPrimitive.Content key={mode} value={mode} forceMount className="outline-none data-[state=inactive]:hidden">
                {status!.status === "allowed" ? (
                  <Panel />
                ) : (
                  <div className="max-w-3xl rounded-xl border p-6">
                    <ToolAccess tool={tool} status={status!} />
                  </div>
                )}
              </TabsPrimitive.Content>
            );
          })}
        </TabsPrimitive.Root>
      )}
    </div>
  );
}
