"use client";

import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Save, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ChosenPdf } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { ToolPage } from "@/components/tools/tool-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { organizePdf } from "@/lib/pdf-tools";
import { cn } from "@/lib/utils";

export default function OrganizePdfPage() {
  return (
    <ToolPage tool="pdf_organize">
      <Organize />
    </ToolPage>
  );
}

function Organize() {
  const t = useTranslations("tools.files");
  const one = useOnePdf();
  if (one.pdf) return <OrganizePages key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <div className="space-y-4">
      <FileDrop accept="application/pdf,.pdf" label={t("chooseOne")} hint={t("dropOne")} onFiles={one.choose} />
      <FileProblems problems={one.problems} />
    </div>
  );
}

/** A page of the original (from 0), how far it is turned, and whether it is left out. */
type Page = { index: number; turn: number; removed: boolean };
const original = (count: number): Page[] => Array.from({ length: count }, (_, index) => ({ index, turn: 0, removed: false }));

function OrganizePages({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const problem = useFileProblem();
  const doc = usePdfDocument(pdf.bytes);
  const [pages, setPages] = useState(() => original(pdf.pages));
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const kept = pages.filter((p) => !p.removed);
  const changed = pages.some((p, i) => p.index !== i || p.turn % 360 !== 0 || p.removed);

  const change = (i: number, update: Partial<Page>) => setPages((current) => current.map((p, j) => (j === i ? { ...p, ...update } : p)));
  const move = (i: number, by: number) =>
    setPages((current) => {
      const next = [...current];
      const [page] = next.splice(i, 1);
      next.splice(i + by, 0, page);
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      downloadBytes(`${baseName(pdf.name)}-organized.pdf`, await organizePdf(pdf.bytes, kept));
      recordUse("pdf_organize");
      toast.success(t("files.ready"));
      setProblems([]);
    } catch (error) {
      setProblems([problem(pdf.name, error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <ChosenPdf name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      <p className="text-sm text-muted-foreground">{t("organize.hint")}</p>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3" aria-label={pdf.name}>
        {pages.map((page, i) => {
          const n = page.index + 1;
          return (
            <li key={page.index} className={cn("flex flex-col gap-2 rounded-lg border p-2", page.removed && "border-dashed bg-muted/50")}>
              <div className={cn("relative flex h-40 items-center justify-center", page.removed && "opacity-30")}>
                <PdfThumb doc={doc} page={n} turn={page.turn} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
                <span className="tabular-nums">{t("organize.page", { n })}</span>
                {page.removed && <Badge variant="secondary">{t("organize.removed")}</Badge>}
              </div>
              <div className="flex flex-wrap justify-center gap-0.5">
                {page.removed ? (
                  <Button variant="outline" size="sm" onClick={() => change(i, { removed: false })}>
                    <Undo2 />
                    {t("organize.restore", { n })}
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.rotateLeft", { n })} onClick={() => change(i, { turn: page.turn - 90 })}>
                      <RotateCcw />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.rotateRight", { n })} onClick={() => change(i, { turn: page.turn + 90 })}>
                      <RotateCw />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.moveEarlier", { n })} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowLeft className="rtl:rotate-180" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.moveLater", { n })} disabled={i === pages.length - 1} onClick={() => move(i, 1)}>
                      <ArrowRight className="rtl:rotate-180" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.remove", { n })} onClick={() => change(i, { removed: true })}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <FileProblems problems={problems} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={kept.length === 0 || busy} onClick={save}>
          <Save />
          {busy ? t("files.working") : t("organize.action")}
        </Button>
        <Button variant="outline" disabled={!changed || busy} onClick={() => setPages(original(pdf.pages))}>
          {t("organize.reset")}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {kept.length === 0 ? t("organize.allRemoved") : t("files.pages", { count: kept.length })}
        </span>
      </div>
    </div>
  );
}
