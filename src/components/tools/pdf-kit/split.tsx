"use client";

import { zipSync } from "fflate";
import { Check, File, Files, Layers, ListChecks, Scissors, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, OptionCards, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extractPages, formatPageRanges, parsePageRanges, splitPdf } from "@/lib/pdf-tools";
import { cn } from "@/lib/utils";

const OUTPUTS = [
  { value: "one", icon: File },
  { value: "ranges", icon: Files },
  { value: "every", icon: Layers },
] as const;
type Output = (typeof OUTPUTS)[number]["value"];

/** Names that stay apart in a zip, should two parts come out the same. */
function distinct(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(/\.pdf$/, `-${n}.pdf`);
  });
}

/** Pages taken out of a PDF: together, a file per range, or a file per page. */
export function SplitPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <SplitPages key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={Scissors} title={t("split.title")} description={t("descriptions.pdf_split")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

function SplitPages({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const problem = useFileProblem();
  const doc = usePdfDocument(pdf.bytes);
  const inputId = useId();
  const [text, setText] = useState("");
  const [output, setOutput] = useState<Output>("one");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const groups = parsePageRanges(text, pdf.pages);
  const invalid = text.trim() !== "" && groups === null;
  // In the order written, each page once.
  const order = [...new Set(groups?.flat() ?? [])];
  const chosen = new Set(order);
  const every = Array.from({ length: pdf.pages }, (_, i) => i);

  const toggle = (page: number) => {
    const next = new Set(chosen);
    if (next.has(page)) next.delete(page);
    else next.add(page);
    setText(formatPageRanges([...next]));
  };

  const run = async () => {
    if (!groups) return;
    setBusy(true);
    try {
      const base = baseName(pdf.name);
      if (output === "one") {
        downloadBytes(`${base}-pages.pdf`, await extractPages(pdf.bytes, order));
      } else {
        const parts = output === "ranges" ? groups : order.map((p) => [p]);
        const files = await splitPdf(pdf.bytes, parts);
        const names = distinct(parts.map((g) => (g.length === 1 ? `${base}-page-${g[0] + 1}.pdf` : `${base}-pages-${g[0] + 1}-${g[g.length - 1] + 1}.pdf`)));
        if (files.length === 1) downloadBytes(names[0], files[0]);
        // PDFs are compressed already, so the zip only stores them.
        else downloadBytes(`${base}-split.zip`, zipSync(Object.fromEntries(names.map((name, i) => [name, [files[i], { level: 0 }]]))), "application/zip");
      }
      recordUse("pdf_split");
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
      icon={Scissors}
      title={t("split.title")}
      description={t("descriptions.pdf_split")}
      footer={
        <>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("split.chosen", { count: order.length })}
          </span>
          <Button size="lg" disabled={order.length === 0 || busy} onClick={run}>
            <Scissors />
            {busy ? t("files.working") : t("split.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} preview={<PdfThumb doc={doc} page={1} size={64} />} />
      <div className="flex flex-wrap items-end gap-3">
        <Field data-invalid={invalid || undefined} className="min-w-0 flex-1 basis-60">
          <FieldLabel htmlFor={inputId}>{t("split.pages")}</FieldLabel>
          <Input id={inputId} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={invalid || undefined} inputMode="numeric" autoComplete="off" placeholder="1-3, 5" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setText(formatPageRanges(every))}>
            <ListChecks />
            {t("split.all")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setText(formatPageRanges(every.filter((p) => p % 2 === 0)))}>
            {t("split.odd")}
          </Button>
          <Button variant="outline" size="sm" disabled={pdf.pages < 2} onClick={() => setText(formatPageRanges(every.filter((p) => p % 2 === 1)))}>
            {t("split.even")}
          </Button>
          <Button variant="ghost" size="sm" disabled={text === ""} onClick={() => setText("")}>
            <X />
            {t("split.clear")}
          </Button>
        </div>
      </div>
      {invalid && <FieldError>{t("split.invalid", { count: pdf.pages })}</FieldError>}
      {!invalid && <FieldDescription className="-mt-3">{t("split.pagesHint")}</FieldDescription>}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3" aria-label={pdf.name}>
        {every.map((i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={chosen.has(i)}
              onClick={() => toggle(i)}
              className={cn(
                "group relative flex w-full flex-col items-center gap-2 rounded-xl border bg-background p-2 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                chosen.has(i) ? "border-primary bg-brand-soft ring-1 ring-primary" : "hover:border-primary/40 hover:shadow-sm",
              )}
            >
              <span className="flex h-36 w-full items-center justify-center">
                <PdfThumb doc={doc} page={i + 1} />
              </span>
              <span className="text-sm tabular-nums">{t("split.page", { n: i + 1 })}</span>
              <span
                className={cn(
                  "absolute end-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition-colors",
                  chosen.has(i) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 bg-background/90 opacity-0 group-hover:opacity-100",
                )}
                aria-hidden
              >
                {chosen.has(i) && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <OptionCards
        legend={t("split.output")}
        value={output}
        onChange={setOutput}
        options={OUTPUTS.map(({ value, icon }) => ({ value, icon, label: t(`split.${value}`), hint: t(`split.outputHints.${value}`) }))}
      />
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}
