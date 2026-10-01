"use client";

import { zipSync } from "fflate";
import { CheckCircle2, Scissors } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ChosenPdf, Choices } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { ToolPage } from "@/components/tools/tool-page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extractPages, formatPageRanges, parsePageRanges, splitPdf } from "@/lib/pdf-tools";
import { cn } from "@/lib/utils";

const OUTPUTS = ["one", "ranges", "every"] as const;
type Output = (typeof OUTPUTS)[number];

export default function SplitPdfPage() {
  return (
    <ToolPage tool="pdf_split">
      <Split />
    </ToolPage>
  );
}

function Split() {
  const t = useTranslations("tools.files");
  const one = useOnePdf();
  if (one.pdf) return <SplitPages key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <div className="space-y-4">
      <FileDrop accept="application/pdf,.pdf" label={t("chooseOne")} hint={t("dropOne")} onFiles={one.choose} />
      <FileProblems problems={one.problems} />
    </div>
  );
}

/** Names that stay apart in a zip, should two parts come out the same. */
function distinct(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(/\.pdf$/, `-${n}.pdf`);
  });
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
    <div className="space-y-6">
      <ChosenPdf name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={inputId}>{t("split.pages")}</FieldLabel>
          <Input id={inputId} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={invalid || undefined} inputMode="numeric" autoComplete="off" />
          <FieldDescription>{t("split.pagesHint")}</FieldDescription>
          {invalid && <FieldError>{t("split.invalid", { count: pdf.pages })}</FieldError>}
        </Field>
        <div className="flex flex-wrap gap-2 md:pb-7">
          <Button variant="outline" size="sm" onClick={() => setText(pdf.pages === 1 ? "1" : `1-${pdf.pages}`)}>
            {t("split.selectAll")}
          </Button>
          <Button variant="outline" size="sm" disabled={text === ""} onClick={() => setText("")}>
            {t("split.clear")}
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3" aria-label={pdf.name}>
        {Array.from({ length: pdf.pages }, (_, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={chosen.has(i)}
              onClick={() => toggle(i)}
              className={cn(
                "relative flex w-full flex-col items-center gap-2 rounded-lg border p-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                chosen.has(i) ? "border-primary bg-brand-soft" : "hover:bg-muted",
              )}
            >
              <span className="flex h-36 w-full items-center justify-center">
                <PdfThumb doc={doc} page={i + 1} />
              </span>
              <span className="text-sm tabular-nums">{t("split.page", { n: i + 1 })}</span>
              {chosen.has(i) && <CheckCircle2 className="absolute end-2 top-2 size-5 fill-background text-primary" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>

      <Choices legend={t("split.output")} value={output} onChange={setOutput} options={OUTPUTS.map((value) => ({ value, label: t(`split.${value}`) }))} />
      <FileProblems problems={problems} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={order.length === 0 || busy} onClick={run}>
          <Scissors />
          {busy ? t("files.working") : t("split.action")}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {t("split.chosen", { count: order.length })}
        </span>
      </div>
    </div>
  );
}
