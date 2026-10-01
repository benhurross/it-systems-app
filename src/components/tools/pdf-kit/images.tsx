"use client";

import { FileDown, ImagePlus, Images } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Choices, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems, OrderedFiles } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, readFile, recordUse, useFileProblem, useSizeLimit } from "@/components/tools/files";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { imageKind, type ImagePageOptions, imagesToPdf, jpegOrientation, type PdfImage } from "@/lib/pdf-tools";

type ImageFile = { id: number; name: string; size: number; url: string; image: PdfImage };

const MARGINS = { none: 0, small: 18, large: 36 } as const;
const MARGIN_LABELS = { none: "marginNone", small: "marginSmall", large: "marginLarge" } as const;
type Margin = keyof typeof MARGINS;

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

/** Photos and scans made into one PDF, a page each. */
export function ImagesPanel() {
  const t = useTranslations("tools");
  const locale = useLocale();
  const problem = useFileProblem();
  const nextId = useRef(1);
  const urls = useRef<string[]>([]);
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const limit = useSizeLimit();
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
      setOpening(file.name);
      try {
        const image = await prepare(file);
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        added.push({ id: nextId.current++, name: file.name, size: file.size, url, image });
      } catch (error) {
        found.push(problem(file.name, error));
      }
    }
    setOpening(null);
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

  const accept = "image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png";
  return (
    <ToolPanel
      icon={Images}
      title={t("names.images_to_pdf")}
      description={t("images.hint")}
      footer={
        <>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {files.length === 0 ? t("images.empty") : t("files.pages", { count: files.length })}
          </span>
          <Button size="lg" disabled={files.length === 0 || busy} onClick={make}>
            <FileDown />
            {busy ? t("files.working") : t("images.action")}
          </Button>
        </>
      }
    >
      {files.length === 0 ? (
        <FileDrop accept={accept} multiple icon={ImagePlus} title={t("files.dropImages")} button={t("files.chooseImages")} hint={t("files.imageLimit", { size: limit })} onFiles={add} />
      ) : (
        <>
          <OrderedFiles
            files={files}
            onChange={setFiles}
            label={t("names.images_to_pdf")}
            // eslint-disable-next-line @next/next/no-img-element -- a local preview, never served
            preview={(file) => <img src={file.url} alt="" className="max-h-full max-w-full rounded-sm object-contain ring-1 ring-border" />}
            detail={(file) => `${file.image.width} × ${file.image.height} · ${formatBytes(file.size, locale)}`}
          />
          <FileDrop accept={accept} multiple compact title={t("files.dropImages")} button={t("files.addImages")} hint={t("files.imageLimit", { size: limit })} onFiles={add} />
        </>
      )}
      <Opening name={opening} />
      <FileProblems problems={problems} />
      <div className="grid gap-5 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
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
    </ToolPanel>
  );
}
