"use client";

import { Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Choices, FileChip, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { extractPages, isStampText, NUMBER_POSITIONS, NUMBER_STYLES, type StampOptions, stampPdf } from "@/lib/pdf-tools";

const STRENGTHS = { light: 0.15, medium: 0.25, strong: 0.4 } as const;
type Strength = keyof typeof STRENGTHS;
const WATERMARK_SIZE = 72;

/** Page numbers and a watermark on every page of a PDF. */
export function StampPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <StampPages key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={Hash} title={t("names.pdf_stamp")} description={t("stamp.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

/** A switch with its label beside it, turning a group of settings on or off. */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
    </div>
  );
}

/** A whole number from `min` to `max`, or null. */
function whole(text: string, min: number, max: number) {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function StampPages({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const problem = useFileProblem();
  const ids = { start: useId(), size: useId(), text: useId() };
  const [numbersOn, setNumbersOn] = useState(true);
  const [position, setPosition] = useState<(typeof NUMBER_POSITIONS)[number]>("bottomCenter");
  const [style, setStyle] = useState<(typeof NUMBER_STYLES)[number]>("pageOf");
  const [start, setStart] = useState("1");
  const [size, setSize] = useState("10");
  const [watermarkOn, setWatermarkOn] = useState(false);
  const [text, setText] = useState("CONFIDENTIAL");
  const [strength, setStrength] = useState<Strength>("medium");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const startNumber = whole(start, 0, 9999);
  const sizeNumber = whole(size, 6, 36);
  const textProblem = !text.trim() ? "textEmpty" : !isStampText(text) ? "latinOnly" : null;
  const valid = (!numbersOn || (startNumber !== null && sizeNumber !== null)) && (!watermarkOn || textProblem === null);
  const options = useMemo<StampOptions | null>(
    () =>
      valid && (numbersOn || watermarkOn)
        ? {
            numbers: numbersOn ? { position, style, start: startNumber!, size: sizeNumber! } : null,
            watermark: watermarkOn ? { text: text.trim(), opacity: STRENGTHS[strength], size: WATERMARK_SIZE } : null,
          }
        : null,
    [valid, numbersOn, watermarkOn, position, style, startNumber, sizeNumber, text, strength],
  );

  // The first page alone, stamped again shortly after each change, to show how it will look.
  const [firstPage, setFirstPage] = useState<Uint8Array | null>(null);
  const [stamped, setStamped] = useState<Uint8Array | null>(null);
  useEffect(() => {
    let live = true;
    extractPages(pdf.bytes, [0])
      .then((bytes) => live && setFirstPage(bytes))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pdf.bytes]);
  useEffect(() => {
    if (!firstPage || !options) return;
    let live = true;
    const timer = setTimeout(() => {
      stampPdf(firstPage, options, pdf.pages)
        .then((bytes) => live && setStamped(bytes))
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [firstPage, options, pdf.pages]);
  const preview = usePdfDocument(options ? (stamped ?? firstPage) : firstPage);
  const first = usePdfDocument(firstPage);

  const run = async () => {
    if (!options) return;
    setBusy(true);
    try {
      downloadBytes(`${baseName(pdf.name)}-stamped.pdf`, await stampPdf(pdf.bytes, options));
      recordUse("pdf_stamp");
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
      icon={Hash}
      title={t("names.pdf_stamp")}
      description={t("stamp.hint")}
      footer={
        <>
          <span className="text-sm text-muted-foreground">{!numbersOn && !watermarkOn ? t("stamp.nothing") : ""}</span>
          <Button size="lg" disabled={!options || busy} onClick={run}>
            <Hash />
            {busy ? t("files.working") : t("stamp.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} preview={<PdfThumb doc={first} page={1} size={64} />} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-8">
          <div className="space-y-5">
            <Toggle label={t("stamp.numbers")} checked={numbersOn} onChange={setNumbersOn} />
            {numbersOn && (
              <div className="space-y-5 border-s-2 ps-4">
                <Choices
                  legend={t("stamp.position")}
                  value={position}
                  onChange={setPosition}
                  options={NUMBER_POSITIONS.map((value) => ({ value, label: t(`stamp.positions.${value}`) }))}
                  className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
                />
                <Choices
                  legend={t("stamp.style")}
                  value={style}
                  onChange={setStyle}
                  options={NUMBER_STYLES.map((value) => ({ value, label: <bdi dir="ltr">{t(`stamp.styles.${value}`)}</bdi> }))}
                />
                <div className="grid max-w-md gap-4 sm:grid-cols-2">
                  <Field data-invalid={startNumber === null || undefined}>
                    <FieldLabel htmlFor={ids.start}>{t("stamp.start")}</FieldLabel>
                    <Input id={ids.start} type="number" min={0} max={9999} value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={startNumber === null || undefined} />
                    {startNumber === null && <FieldError>{t("stamp.startInvalid")}</FieldError>}
                  </Field>
                  <Field data-invalid={sizeNumber === null || undefined}>
                    <FieldLabel htmlFor={ids.size}>{t("stamp.size")}</FieldLabel>
                    <Input id={ids.size} type="number" min={6} max={36} value={size} onChange={(e) => setSize(e.target.value)} aria-invalid={sizeNumber === null || undefined} />
                    {sizeNumber === null && <FieldError>{t("stamp.sizeInvalid")}</FieldError>}
                  </Field>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-5">
            <Toggle label={t("stamp.watermark")} checked={watermarkOn} onChange={setWatermarkOn} />
            {watermarkOn && (
              <div className="space-y-5 border-s-2 ps-4">
                <Field data-invalid={textProblem !== null || undefined} className="max-w-md">
                  <FieldLabel htmlFor={ids.text}>{t("stamp.text")}</FieldLabel>
                  <Input id={ids.text} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} aria-invalid={textProblem !== null || undefined} dir="ltr" />
                  <FieldDescription>{t("stamp.textHint")}</FieldDescription>
                  {textProblem && <FieldError>{t(`stamp.${textProblem}`)}</FieldError>}
                </Field>
                <Choices
                  legend={t("stamp.strength")}
                  value={strength}
                  onChange={setStrength}
                  options={(["light", "medium", "strong"] as const).map((value) => ({ value, label: t(`stamp.${value}`) }))}
                />
              </div>
            )}
          </div>
        </div>
        <figure className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <div className="flex aspect-square w-full max-w-72 items-center justify-center rounded-xl border bg-muted/40 p-3">
            <PdfThumb doc={preview} page={1} size={264} label={t("stamp.preview")} />
          </div>
          <figcaption className="text-center text-sm text-muted-foreground">{t("stamp.preview")}</figcaption>
        </figure>
      </div>
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}
