"use client";

import { Combine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileProblems, OrderedFiles } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, readFile, recordUse, useFileProblem } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { ToolPage } from "@/components/tools/tool-page";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { loadPdf, mergePdfs } from "@/lib/pdf-tools";

type PdfFile = { id: number; name: string; size: number; bytes: Uint8Array; pages: number };

export default function MergePdfsPage() {
  return (
    <ToolPage tool="pdf_merge">
      <Merge />
    </ToolPage>
  );
}

function FirstPage({ file }: { file: PdfFile }) {
  const t = useTranslations("tools.split");
  return <PdfThumb doc={usePdfDocument(file.bytes)} page={1} label={`${file.name}: ${t("page", { n: 1 })}`} />;
}

function Merge() {
  const t = useTranslations("tools");
  const locale = useLocale();
  const problem = useFileProblem();
  const nextId = useRef(1);
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pages = files.reduce((n, f) => n + f.pages, 0);

  const add = async (chosen: File[]) => {
    const found: string[] = [];
    const added: PdfFile[] = [];
    for (const file of chosen) {
      try {
        const bytes = await readFile(file);
        const pdf = await loadPdf(bytes);
        added.push({ id: nextId.current++, name: file.name, size: file.size, bytes, pages: pdf.getPageCount() });
      } catch (error) {
        found.push(problem(file.name, error));
      }
    }
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("merge.hint")}</p>
      <FileDrop accept="application/pdf,.pdf" multiple label={t("files.choose")} hint={t("files.drop")} onFiles={add} />
      <FileProblems problems={problems} />
      {files.length > 0 && (
        <OrderedFiles
          files={files}
          onChange={setFiles}
          label={t("names.pdf_merge")}
          preview={(file) => <FirstPage file={file} />}
          detail={(file) => `${t("files.pages", { count: file.pages })} · ${formatBytes(file.size, locale)}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={files.length < 2 || busy} onClick={merge}>
          <Combine />
          {busy ? t("files.working") : t("merge.action")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {files.length < 2 ? t("merge.empty") : t("merge.total", { files: files.length, pages })}
        </span>
      </div>
    </div>
  );
}
