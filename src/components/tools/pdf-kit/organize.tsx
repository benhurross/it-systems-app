"use client";

import { ArrowLeft, ArrowRight, Download, LayoutGrid, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { moved, useDragOrder } from "@/components/tools/reorder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { organizePdf } from "@/lib/pdf-tools";
import { cn } from "@/lib/utils";

/** Pages turned, put in another order or left out, saved as a new PDF. */
export function OrganizePanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <OrganizePages key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={LayoutGrid} title={t("organize.title")} description={t("organize.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
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
  const order = useDragOrder(pages, setPages);
  const kept = pages.filter((p) => !p.removed);
  const changed = pages.some((p, i) => p.index !== i || p.turn % 360 !== 0 || p.removed);

  const change = (i: number, update: Partial<Page>) => setPages((current) => current.map((p, j) => (j === i ? { ...p, ...update } : p)));
  const turnAll = (by: number) => setPages((current) => current.map((p) => (p.removed ? p : { ...p, turn: p.turn + by })));

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
    <ToolPanel
      icon={LayoutGrid}
      title={t("organize.title")}
      description={t("organize.dragHint")}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => turnAll(-90)}>
            <RotateCcw />
            {t("organize.rotateAllLeft")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => turnAll(90)}>
            <RotateCw />
            {t("organize.rotateAllRight")}
          </Button>
          <Button variant="ghost" size="sm" disabled={!changed || busy} onClick={() => setPages(original(pdf.pages))}>
            <Undo2 />
            {t("organize.reset")}
          </Button>
        </>
      }
      footer={
        <>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {kept.length === 0 ? t("organize.allRemoved") : t("organize.kept", { kept: kept.length, total: pdf.pages })}
          </span>
          <Button size="lg" disabled={kept.length === 0 || busy} onClick={save}>
            <Download />
            {busy ? t("files.working") : t("organize.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} preview={<PdfThumb doc={doc} page={1} size={64} />} />
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3" aria-label={pdf.name}>
        {pages.map((page, i) => {
          const n = page.index + 1;
          return (
            <li
              key={page.index}
              {...order.handlers(i)}
              className={cn(
                "group flex cursor-grab flex-col gap-2 rounded-xl border bg-background p-2 transition-all active:cursor-grabbing",
                page.removed ? "border-dashed bg-muted/50" : "hover:border-primary/40 hover:shadow-sm",
                order.dragging === i && "opacity-40",
                order.over === i && order.dragging !== i && "border-primary ring-2 ring-primary/30",
              )}
            >
              <div className="flex items-center justify-between gap-2 px-1 text-sm">
                <span className="font-medium tabular-nums">{t("organize.page", { n })}</span>
                {page.removed ? (
                  <Badge variant="secondary">{t("organize.removed")}</Badge>
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums" aria-hidden>
                    {kept.indexOf(page) + 1}
                  </span>
                )}
              </div>
              <div className={cn("flex h-40 items-center justify-center", page.removed && "opacity-30 grayscale")}>
                <PdfThumb doc={doc} page={n} turn={page.turn} />
              </div>
              <div className="flex flex-wrap justify-center gap-0.5 border-t pt-2">
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
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.moveEarlier", { n })} disabled={i === 0} onClick={() => setPages(moved(pages, i, i - 1))}>
                      <ArrowLeft className="rtl:rotate-180" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("organize.moveLater", { n })} disabled={i === pages.length - 1} onClick={() => setPages(moved(pages, i, i + 1))}>
                      <ArrowRight className="rtl:rotate-180" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("organize.remove", { n })}
                      onClick={() => change(i, { removed: true })}
                    >
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
    </ToolPanel>
  );
}
