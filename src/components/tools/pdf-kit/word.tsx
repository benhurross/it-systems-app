"use client";

import type { PDFPageProxy } from "pdfjs-dist";
import { Check, CircleCheck, Download, FilePen, Image, Info, RotateCcw, SeparatorHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileChip, Opening, SwitchRow, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { loadPdfJs, PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type Box, type PictureBit, pagesToDocx, readPdf, scannedPages } from "@/lib/pdf-to-word";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KEEPS = ["text", "styles", "tables", "pictures", "arabic"] as const;

/**
 * The pictures on a page, cut from the page drawn at twice its size (smaller for very large
 * pages): small ones as PNG to stay sharp, large ones as JPEG to stay small.
 */
async function cutPictures(page: PDFPageProxy, boxes: Box[]): Promise<PictureBit[]> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, 4096 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const pictures: PictureBit[] = [];
  for (const box of boxes) {
    const piece = document.createElement("canvas");
    piece.width = Math.max(1, Math.round(box.width * scale));
    piece.height = Math.max(1, Math.round(box.height * scale));
    const context = piece.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, piece.width, piece.height);
    context.drawImage(canvas, box.x * scale, box.y * scale, box.width * scale, box.height * scale, 0, 0, piece.width, piece.height);
    const type = piece.width * piece.height <= 250_000 ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => piece.toBlob(resolve, type, 0.9));
    if (blob) pictures.push({ ...box, bytes: new Uint8Array(await blob.arrayBuffer()), type });
  }
  // Let the browser have the memory back straight away.
  canvas.width = 0;
  canvas.height = 0;
  return pictures;
}

/** A PDF made into a Word document, in the browser. */
export function WordPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <ConvertPdf key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={FilePen} title={t("names.pdf_to_word")} description={t("descriptions.pdf_to_word")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
      <WhatCarriesOver />
    </ToolPanel>
  );
}

function WhatCarriesOver() {
  const t = useTranslations("tools.word");
  return (
    <div className="grid gap-4 rounded-xl bg-muted/40 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h3 className="mb-2 text-sm font-medium">{t("keeps")}</h3>
        <ul className="space-y-1.5 text-sm">
          {KEEPS.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {t(`keep.${key}`)}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("limits")}
      </p>
    </div>
  );
}

type Stage = { step: "ready" } | { step: "reading"; page: number; total: number } | { step: "writing" } | { step: "done"; name: string; bytes: Uint8Array; scanned: number[] };

function ConvertPdf({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const problem = useFileProblem();
  const doc = usePdfDocument(pdf.bytes);
  const [pageBreaks, setPageBreaks] = useState(true);
  const [pictures, setPictures] = useState(true);
  const [stage, setStage] = useState<Stage>({ step: "ready" });
  const [problems, setProblems] = useState<string[]>([]);
  const busy = stage.step === "reading" || stage.step === "writing";

  const convert = async () => {
    setProblems([]);
    setStage({ step: "reading", page: 0, total: pdf.pages });
    try {
      const pdfjs = await loadPdfJs();
      // pdf.js takes the buffer it is given, so it gets a copy.
      const source = await pdfjs.getDocument({ data: pdf.bytes.slice() }).promise;
      try {
        const pages = await readPdf(source, pdfjs as never, {
          // Scans are only pictures, so they are kept even when pictures are not.
          pictures: (page, boxes, scan) => (pictures || scan ? cutPictures(page, boxes) : Promise.resolve([])),
          onPage: (page, total) => setStage({ step: "reading", page, total }),
        });
        setStage({ step: "writing" });
        const name = `${baseName(pdf.name)}.docx`;
        const bytes = pagesToDocx(pages, baseName(pdf.name), { pageBreaks });
        downloadBytes(name, bytes, DOCX);
        recordUse("pdf_to_word");
        setStage({ step: "done", name, bytes, scanned: scannedPages(pages) });
      } finally {
        void source.destroy();
      }
    } catch (error) {
      setStage({ step: "ready" });
      setProblems([problem(pdf.name, error)]);
    }
  };

  if (stage.step === "done") {
    return (
      <ToolPanel icon={FilePen} title={t("names.pdf_to_word")} description={t("descriptions.pdf_to_word")}>
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CircleCheck className="size-8" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-medium break-all">{t("word.done", { name: stage.name })}</p>
            <p className="text-sm text-muted-foreground">{t("word.doneHint")}</p>
          </div>
          {stage.scanned.length > 0 && (
            <p className="flex max-w-xl items-start gap-2 rounded-lg bg-muted/60 p-3 text-start text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("word.scanned", { count: stage.scanned.length, pages: stage.scanned.join(", ") })}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => downloadBytes(stage.name, stage.bytes, DOCX)}>
              <Download />
              {t("word.downloadAgain")}
            </Button>
            <Button variant="outline" onClick={onClear}>
              <RotateCcw />
              {t("word.another")}
            </Button>
          </div>
        </div>
      </ToolPanel>
    );
  }

  return (
    <ToolPanel
      icon={FilePen}
      title={t("names.pdf_to_word")}
      description={t("descriptions.pdf_to_word")}
      footer={
        <>
          <span className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground" aria-live="polite">
            {stage.step === "reading" && stage.page > 0 && t("word.reading", { page: stage.page, total: stage.total })}
            {stage.step === "writing" && t("word.writing")}
          </span>
          <Button size="lg" disabled={busy} onClick={convert}>
            <FilePen />
            {busy ? t("files.working") : t("word.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} preview={<PdfThumb doc={doc} page={1} size={64} />} />
      {busy && (
        <Progress
          value={stage.step === "writing" ? 100 : (100 * stage.page) / Math.max(1, stage.total)}
          className="h-1.5 rtl:-scale-x-100"
          aria-label={t("word.action")}
        />
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("word.title")}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <SwitchRow icon={SeparatorHorizontal} label={t("word.pageBreaks")} hint={t("word.pageBreaksHint")} checked={pageBreaks} onChange={setPageBreaks} />
          <SwitchRow icon={Image} label={t("word.pictures")} hint={t("word.picturesHint")} checked={pictures} onChange={setPictures} />
        </div>
      </div>
      <WhatCarriesOver />
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}
