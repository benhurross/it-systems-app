"use client";

import { Hint } from "@/components/hint";
import { ChevronLeft, ChevronRight, Plus, Signature as SignatureIcon, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { type Signature, SignatureMaker } from "@/components/tools/pdf-kit/signature-maker";
import { PdfPage, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/hooks/use-format";
import { DATE_SHARE, type SignPlacement, signPdf } from "@/lib/pdf-sign";
import { isStampText } from "@/lib/pdf-tools";

/**
 * A signature placed on a page: where its box starts and how wide it is, as fractions of the page
 * as shown. Its height follows from the signature's shape, the page's, and whether the date is on.
 */
type Placed = { id: number; page: number; x: number; y: number; width: number; aspect: number };

const heightOf = (p: Placed, ratio: number, withDate: boolean) => (p.width * p.aspect) / ratio / (withDate ? 1 - DATE_SHARE : 1);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Signing a PDF: make a signature, place it on the pages, and download the signed copy. */
export function SignPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <SignFile key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={SignatureIcon} title={t("names.pdf_sign")} description={t("sign.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

function SignFile({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const format = useFormat();
  const problem = useFileProblem();
  const dateId = useId();
  const doc = usePdfDocument(pdf.bytes);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [page, setPage] = useState(1);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const nextId = useRef(1);
  const [withDate, setWithDate] = useState(false);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date()));
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // The signature's picture is let go when another replaces it.
  useEffect(() => () => void (signature && URL.revokeObjectURL(signature.url)), [signature]);

  const dateProblem = withDate && (!date.trim() ? "dateEmpty" : !isStampText(date) ? "latinOnly" : null);
  const pagesSigned = [...new Set(placed.map((p) => p.page))].sort((a, b) => a - b);

  const add = (aspect: number) => {
    if (!signature) return;
    // A third of the page across, smaller if that would be too tall, near the foot on the right.
    let width = 0.3;
    const probe = { id: 0, page, x: 0, y: 0, width, aspect };
    const height = heightOf(probe, signature.ratio, withDate);
    if (height > 0.2) width *= 0.2 / height;
    const box = { ...probe, id: nextId.current++, width };
    const h = heightOf(box, signature.ratio, withDate);
    setPlaced((all) => [...all, { ...box, x: clamp(1 - width - 0.06, 0, 1 - width), y: clamp(1 - h - 0.08, 0, 1 - h) }]);
  };
  const update = (id: number, change: (p: Placed) => Partial<Placed>) =>
    setPlaced((all) =>
      all.map((p) => {
        if (p.id !== id || !signature) return p;
        const next = { ...p, ...change(p) };
        next.width = clamp(next.width, 0.05, 1);
        const h = heightOf(next, signature.ratio, withDate);
        if (h > 1) next.width *= 1 / h;
        return { ...next, x: clamp(next.x, 0, 1 - next.width), y: clamp(next.y, 0, 1 - heightOf(next, signature.ratio, withDate)) };
      }),
    );

  // The date makes each signature's box taller: each is kept on its page.
  const toggleDate = (on: boolean) => {
    setWithDate(on);
    if (signature) setPlaced((all) => all.map((p) => ({ ...p, y: clamp(p.y, 0, Math.max(0, 1 - heightOf(p, signature.ratio, on))) })));
  };

  const run = async () => {
    if (!signature || placed.length === 0 || dateProblem) return;
    setBusy(true);
    try {
      const placements: SignPlacement[] = placed.map((p) => ({ page: p.page - 1, x: p.x, y: p.y, width: p.width, height: heightOf(p, signature.ratio, withDate) }));
      downloadBytes(`${baseName(pdf.name)}-signed.pdf`, await signPdf(pdf.bytes, signature.png, placements, withDate ? date.trim() : null));
      recordUse("pdf_sign");
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
      icon={SignatureIcon}
      title={t("names.pdf_sign")}
      description={t("sign.hint")}
      footer={
        <>
          <span className="text-sm text-muted-foreground">
            {placed.length === 0 ? t("sign.nothing") : t("sign.signedOn", { pages: pagesSigned.map((n) => format.number(n)).join(", "), count: pagesSigned.length })}
          </span>
          <Button size="lg" disabled={!signature || placed.length === 0 || !!dateProblem || busy} onClick={run}>
            <SignatureIcon />
            {busy ? t("files.working") : t("sign.action")}
          </Button>
        </>
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3" aria-label={t("sign.yourSignature")}>
            <h3 className="font-medium">{t("sign.yourSignature")}</h3>
            <SignatureMaker onChange={setSignature} />
          </section>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch id={dateId} checked={withDate} onCheckedChange={toggleDate} />
              <Label htmlFor={dateId} className="text-base">
                {t("sign.withDate")}
              </Label>
            </div>
            {withDate && (
              <Field data-invalid={!!dateProblem || undefined} className="max-w-60 border-s-2 ps-4">
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor={`${dateId}-text`}>{t("sign.date")}</FieldLabel>
                  <Hint>{t("sign.dateHint")}</Hint>
                </div>
                <Input id={`${dateId}-text`} value={date} maxLength={30} dir="ltr" onChange={(e) => setDate(e.target.value)} aria-invalid={!!dateProblem || undefined} />
                <FieldDescription className="sr-only">{t("sign.dateHint")}</FieldDescription>
                {dateProblem && <FieldError>{t(dateProblem === "latinOnly" ? "stamp.latinOnly" : "sign.dateEmpty")}</FieldError>}
              </Field>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t("sign.legal")}</p>
        </div>

        <section className="min-w-0 space-y-3" aria-label={t("sign.pages")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("sign.previous")}>
                <ChevronLeft className="rtl:rotate-180" />
              </Button>
              <span className="min-w-28 text-center text-sm" aria-live="polite">
                {t("sign.pageOf", { page: format.number(page), pages: format.number(pdf.pages) })}
              </span>
              <Button variant="outline" size="icon" disabled={page >= pdf.pages} onClick={() => setPage(page + 1)} aria-label={t("sign.next")}>
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            </div>
            {pagesSigned.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-sm">
                {pagesSigned.map((n) => (
                  <Button key={n} variant={n === page ? "secondary" : "ghost"} size="sm" onClick={() => setPage(n)}>
                    {t("sign.goTo", { page: format.number(n) })}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <PageView
            doc={doc}
            page={page}
            label={t("sign.pageLabel", { page: format.number(page) })}
            hint={signature ? null : t("sign.makeFirst")}
            onAdd={add}
            canAdd={!!signature}
          >
            {signature &&
              placed
                .filter((p) => p.page === page)
                .map((p) => (
                  <PlacedSignature
                    key={p.id}
                    placed={p}
                    signature={signature}
                    height={heightOf(p, signature.ratio, withDate)}
                    date={withDate ? date : null}
                    onMove={(change) => update(p.id, change)}
                    onRemove={() => setPlaced((all) => all.filter((x) => x.id !== p.id))}
                  />
                ))}
          </PageView>
        </section>
      </div>
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}

/** One page drawn large, with the signatures on it laid over it, and the button to add one. */
function PageView({
  doc,
  page,
  label,
  hint,
  canAdd,
  onAdd,
  children,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  label: string;
  hint: string | null;
  canAdd: boolean;
  onAdd: (aspect: number) => void;
  children: ReactNode;
}) {
  const t = useTranslations("tools.sign");
  const [aspect, setAspect] = useState<number | null>(null);
  // A new page is not ready to sign on until it is drawn.
  const [drawnPage, setDrawnPage] = useState<number | null>(null);
  const drawn = useCallback(
    (a: number) => {
      setAspect(a);
      setDrawnPage(page);
    },
    [page],
  );
  const ready = aspect !== null && drawnPage === page;

  return (
    <div className="space-y-3">
      <PdfPage doc={doc} page={page} label={label} onDrawn={drawn}>
        {children}
      </PdfPage>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{hint ?? t("placeHint")}</span>
        <Button variant="outline" disabled={!canAdd || !ready} onClick={() => ready && onAdd(aspect)}>
          <Plus />
          {t("addHere")}
        </Button>
      </div>
    </div>
  );
}

/** A signature on the page: dragged to move, its corner dragged to resize, or moved by keyboard. */
function PlacedSignature({
  placed,
  signature,
  height,
  date,
  onMove,
  onRemove,
}: {
  placed: Placed;
  signature: Signature;
  height: number;
  date: string | null;
  onMove: (change: (p: Placed) => Partial<Placed>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("tools.sign");
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; start: Placed; page: DOMRect } | null>(null);

  const begin = (mode: "move" | "resize", e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: placed, page: e.currentTarget.closest("[dir=ltr]")!.getBoundingClientRect() };
  };
  const follow = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.page.width;
    const dy = (e.clientY - d.y) / d.page.height;
    onMove(() => (d.mode === "move" ? { x: d.start.x + dx, y: d.start.y + dy } : { width: d.start.width + dx }));
  };
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove();
    } else if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      // With Shift, the arrows make it larger or smaller instead.
      onMove((p) => (e.shiftKey ? { width: p.width + (dx || -dy) * 2 } : { x: p.x + dx, y: p.y + dy }));
    }
  };

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={t("placed", { page: placed.page })}
      aria-describedby={`signature-${placed.id}-keys`}
      onKeyDown={keys}
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={follow}
      onPointerUp={() => (drag.current = null)}
      className="group absolute flex cursor-move touch-none flex-col rounded-sm outline-dashed outline-2 outline-primary/70 [container-type:size] focus-visible:outline-primary"
      style={{ left: `${placed.x * 100}%`, top: `${placed.y * 100}%`, width: `${placed.width * 100}%`, height: `${height * 100}%` }}
    >
      <span id={`signature-${placed.id}-keys`} className="sr-only">
        {t("keys")}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- the signature is a picture made on this page, not a file to optimise */}
      <img src={signature.url} alt="" draggable={false} className="min-h-0 w-full flex-1 object-contain object-bottom" />
      {date && (
        <span className="flex items-center justify-center overflow-hidden whitespace-nowrap text-neutral-900" style={{ height: `${DATE_SHARE * 100}%`, fontSize: `min(${DATE_SHARE * 70}cqh, ${Math.round(100 / Math.max(1, date.length * 0.55))}cqw)` }}>
          {date}
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={t("remove", { page: placed.page })}
        className="absolute -end-3 -top-3 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow"
      >
        <X className="size-3.5" />
      </button>
      <span
        aria-hidden
        onPointerDown={(e) => begin("resize", e)}
        onPointerMove={follow}
        onPointerUp={() => (drag.current = null)}
        className="absolute -end-2 -bottom-2 size-4 cursor-nwse-resize rounded-sm border-2 border-white bg-primary shadow"
      />
    </div>
  );
}
