"use client";

import { Combine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems, OrderedFiles } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, readFile, recordUse, useFileProblem, useSizeLimit } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { loadPdf, mergePdfs } from "@/lib/pdf-tools";

type PdfFile = { id: number; name: string; size: number; bytes: Uint8Array; pages: number };

function FirstPage({ file }: { file: PdfFile }) {
  const t = useTranslations("tools.split");
  return <PdfThumb doc={usePdfDocument(file.bytes)} page={1} size={96} label={`${file.name}: ${t("page", { n: 1 })}`} />;
}

/** Several PDFs, put in order and made one. */
export function MergePanel() {
  const t = useTranslations("tools");
  const locale = useLocale();
  const problem = useFileProblem();
  const limit = useSizeLimit();
  const nextId = useRef(1);
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pages = files.reduce((n, f) => n + f.pages, 0);

  const add = async (chosen: File[]) => {
    const found: string[] = [];
    const added: PdfFile[] = [];
    for (const file of chosen) {
      setOpening(file.name);
      try {
        const bytes = await readFile(file);
        const pdf = await loadPdf(bytes);
        added.push({ id: nextId.current++, name: file.name, size: file.size, bytes, pages: pdf.getPageCount() });
      } catch (error) {
        found.push(problem(file.name, error));
      }
    }
    setOpening(null);
    setProblems(found);
    setFiles((current) => [...current, ...added]);
  };

  const merge = async () => {
    setBusy(true);
    try {
      downloadBytes(`${baseName(files[0].name)}-merged.pdf`, await mergePdfs(files.map((f) => f.bytes)));
      recordUse("pdf_merge");
      toast.success(t("files.ready"));
    } catch (error) {
      setProblems([problem(files[0].name, error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPanel
      icon={Combine}
      title={t("merge.title")}
      description={t("merge.hint")}
      footer={
        <>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {files.length < 2 ? t("merge.empty") : t("merge.total", { files: files.length, pages })}
          </span>
          <Button size="lg" disabled={files.length < 2 || busy} onClick={merge}>
            <Combine />
            {busy ? t("files.working") : t("merge.action")}
          </Button>
        </>
      }
    >
      {files.length === 0 ? (
        <FileDrop accept="application/pdf,.pdf" multiple title={t("files.dropFiles")} button={t("files.choose")} hint={t("files.pdfLimit", { size: limit })} onFiles={add} />
      ) : (
        <>
          <OrderedFiles
            files={files}
            onChange={setFiles}
            label={t("merge.title")}
            preview={(file) => <FirstPage file={file} />}
            detail={(file) => `${t("files.pages", { count: file.pages })} · ${formatBytes(file.size, locale)}`}
          />
          <FileDrop accept="application/pdf,.pdf" multiple compact title={t("files.dropFiles")} button={t("files.addMore")} hint={t("files.pdfLimit", { size: limit })} onFiles={add} />
        </>
      )}
      <Opening name={opening} />
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}
