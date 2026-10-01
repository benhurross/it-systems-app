"use client";

import { FileDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Choices } from "@/components/tools/controls";
import { FileProblems, OrderedFiles } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, readFile, recordUse, useFileProblem } from "@/components/tools/files";
import { ToolPage } from "@/components/tools/tool-page";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { imageKind, type ImagePageOptions, imagesToPdf, jpegOrientation, type PdfImage } from "@/lib/pdf-tools";

type ImageFile = { id: number; name: string; size: number; url: string; image: PdfImage };

const MARGINS = { none: 0, small: 18, large: 36 } as const;
const MARGIN_LABELS = { none: "marginNone", small: "marginSmall", large: "marginLarge" } as const;
type Margin = keyof typeof MARGINS;

export default function ImagesToPdfPage() {
  return (
    <ToolPage tool="images_to_pdf">
      <ImagesToPdf />
    </ToolPage>
  );
}

/**
 * An image ready for a PDF page. PNGs and upright JPEGs go in as they are; anything else, or a
 * photo its camera saved sideways, is drawn upright and saved as a JPEG first.
 */
async function prepare(file: File): Promise<PdfImage> {
  const bytes = await readFile(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: "from-image" });
  } catch {
    throw new Error("notImage");
  }
  try {
    const { width, height } = bitmap;
    const kind = imageKind(bytes);
    if (kind === "image/png" || (kind === "image/jpeg" && jpegOrientation(bytes) === 1)) return { bytes, type: kind, width, height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("notImage");
    // JPEG has no see-through parts: those become white, as on paper.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("notImage");
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/jpeg", width, height };
  } finally {
    bitmap.close();
  }
}

function ImagesToPdf() {
  const t = useTranslations("tools");
  const locale = useLocale();
  const problem = useFileProblem();
  const nextId = useRef(1);
  const urls = useRef<string[]>([]);
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<ImagePageOptions["size"]>("a4");
  const [orientation, setOrientation] = useState<ImagePageOptions["orientation"]>("auto");
  const [margin, setMargin] = useState<Margin>("small");

  // The previews are let go when the page closes.
  useEffect(() => {
    const made = urls.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const add = async (chosen: File[]) => {
    const found: string[] = [];
    const added: ImageFile[] = [];
    for (const file of chosen) {
      try {
        const image = await prepare(file);
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        added.push({ id: nextId.current++, name: file.name, size: file.size, url, image });
      } catch (error) {
        found.push(problem(file.name, error));
      }
    }
    setProblems(found);
    setFiles((current) => [...current, ...added]);
  };

  const make = async () => {
    setBusy(true);
    try {
      const pdf = await imagesToPdf(
        files.map((f) => f.image),
        { size, orientation, margin: MARGINS[margin] },
      );
      downloadBytes(`${baseName(files[0].name)}.pdf`, pdf);
      recordUse("images_to_pdf");
      toast.success(t("files.ready"));
    } catch (error) {
      setProblems([problem(files[0].name, error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("images.hint")}</p>
      <FileDrop accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png" multiple label={t("files.chooseImages")} hint={t("files.drop")} onFiles={add} />
      <FileProblems problems={problems} />
      {files.length > 0 && (
        <OrderedFiles
          files={files}
          onChange={setFiles}
          label={t("names.images_to_pdf")}
          // eslint-disable-next-line @next/next/no-img-element -- a local preview, never served
          preview={(file) => <img src={file.url} alt="" className="max-h-full max-w-full rounded-sm object-contain ring-1 ring-border" />}
          detail={(file) => `${file.image.width} × ${file.image.height} · ${formatBytes(file.size, locale)}`}
        />
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Choices
          legend={t("images.pageSize")}
          value={size}
          onChange={setSize}
          options={[
            { value: "a4", label: t("images.a4") },
            { value: "fit", label: t("images.fit") },
          ]}
        />
        {size === "a4" && (
          <Choices
            legend={t("images.orientation")}
            value={orientation}
            onChange={setOrientation}
            options={(["auto", "portrait", "landscape"] as const).map((value) => ({ value, label: t(`images.${value}`) }))}
          />
        )}
        <Choices
          legend={t("images.margin")}
          value={margin}
          onChange={setMargin}
          options={(["none", "small", "large"] as const).map((value) => ({ value, label: t(`images.${MARGIN_LABELS[value]}`) }))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={files.length === 0 || busy} onClick={make}>
          <FileDown />
          {busy ? t("files.working") : t("images.action")}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {files.length === 0 ? t("images.empty") : t("files.pages", { count: files.length })}
        </span>
      </div>
    </div>
  );
}
