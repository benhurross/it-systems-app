"use client";

import { Feather, Shrink, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, OptionCards, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { formatBytes } from "@/lib/files";
import { type CompressLevel, compressPdf, type JpegMaker } from "@/lib/pdf-compress";

/** A file this much smaller or less is not worth a second copy. */
const WORTH_KEEPING = 0.95;

/**
 * The browser's own picture handling makes the JPEGs. A JPEG's EXIF orientation is ignored, as
 * PDF readers ignore it: the picture must stay the way the page shows it.
 */
const browserJpeg: JpegMaker = async (source, width, height, quality) => {
  const input =
    "jpeg" in source
      ? new Blob([source.jpeg as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })
      : new ImageData(source.pixels.data as Uint8ClampedArray<ArrayBuffer>, source.pixels.width, source.pixels.height);
  const bitmap = await createImageBitmap(input, { resizeWidth: width, resizeHeight: height, resizeQuality: "high", imageOrientation: "none" });
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Uint8Array(await blob.arrayBuffer());
};

/** Makes a PDF smaller for email or upload, by shrinking the pictures in it. */
export function CompressPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <CompressFile key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={Shrink} title={t("names.pdf_compress")} description={t("compress.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

type Outcome = { level: CompressLevel; before: number; after: number; kept: boolean };

function CompressFile({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const locale = useLocale();
  const format = useFormat();
  const problem = useFileProblem();
  const [level, setLevel] = useState<CompressLevel>("recommended");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const size = (bytes: number) => formatBytes(bytes, locale);

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    setOutcome(null);
    try {
      const result = await compressPdf(pdf.bytes, level, browserJpeg, (done, total) => setProgress({ done, total }));
      const kept = result.bytes.length < pdf.size * WORTH_KEEPING;
      if (kept) {
        downloadBytes(`${baseName(pdf.name)}-compressed.pdf`, result.bytes);
        recordUse("pdf_compress");
        toast.success(t("files.ready"));
      }
      setOutcome({ level, before: pdf.size, after: result.bytes.length, kept });
      setProblems([]);
    } catch (error) {
      setProblems([problem(pdf.name, error)]);
    } finally {
      setProgress(null);
    }
  };

  return (
    <ToolPanel
      icon={Shrink}
      title={t("names.pdf_compress")}
      description={t("compress.hint")}
      footer={
        <>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {progress && progress.total > 0 ? t("compress.progress", { done: format.number(progress.done), total: format.number(progress.total) }) : ""}
          </span>
          <Button size="lg" disabled={progress !== null} onClick={run}>
            <Shrink />
            {progress ? t("files.working") : t("compress.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      <OptionCards
        legend={t("compress.level")}
        value={level}
        onChange={(value) => {
          setLevel(value);
          setOutcome(null);
        }}
        options={[
          { value: "recommended", label: t("compress.recommended"), hint: t("compress.recommendedHint"), icon: Sparkles },
          { value: "strong", label: t("compress.strong"), hint: t("compress.strongHint"), icon: Feather },
        ]}
      />
      {outcome && (
        <p role="status" className="rounded-lg border bg-muted/40 p-4 text-sm">
          {outcome.kept ? (
            <>
              <span className="block text-base font-medium">
                {t.rich("compress.sizes", { before: size(outcome.before), after: size(outcome.after), size: (chunks) => <bdi>{chunks}</bdi> })}
              </span>
              <span className="text-muted-foreground">
                {t("compress.saved", { percent: format.number(Math.round((1 - outcome.after / outcome.before) * 100)) })}
              </span>
            </>
          ) : (
            t(outcome.level === "recommended" ? "compress.alreadySmallTryStrong" : "compress.alreadySmall")
          )}
        </p>
      )}
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}
