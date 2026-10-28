"use client";

import { Hint } from "@/components/hint";
import { Check, ChevronLeft, ChevronRight, Circle, FormInput, GripVertical, Minus, Plus, Type, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { FormFieldControl } from "@/components/tools/pdf-kit/form-field";
import { PdfPage, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/hooks/use-format";
import { type FormField, FormLockError, type FormValue, type FormValues, fillForm, type ReadForm, readForm } from "@/lib/pdf-form";
import { LINE_HEIGHT, type WrittenItem, writeOnPdf } from "@/lib/pdf-write";
import { cn } from "@/lib/utils";

/**
 * Filling in any PDF, as on paper: choose Text, a tick, a cross or a dot, and click where it goes.
 * Text is typed on the page itself. A PDF with fields of its own has them listed to fill in too.
 */

type Tool = "text" | "tick" | "cross" | "dot";
/** Something put on a page (from 1): text from its top left, a mark by its centre, in fractions of the page as shown. */
type Placed = { id: number; kind: Tool; page: number; x: number; y: number; size: number; text: string };

const TEXT_SIZE = 11;
const MARK_SIZE = 12;
/** A font the browser has that is close to the PDF's Helvetica, so text lands as it was typed. */
const SANS = "Helvetica, Arial, 'Liberation Sans', sans-serif";
/** Text the PDF's standard font writes as text; anything else is placed as the browser draws it. */
const LATIN = /^[\x20-\x7E -ÿ\r\n\t]*$/;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** How much larger than fitting the space the page may be shown. */
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3, 4];

export function FillPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <FillFile key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={FormInput} title={t("names.pdf_fill")} description={t("fill.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

const initial = (fields: FormField[]): FormValues => Object.fromEntries(fields.filter((f) => "value" in f).map((f) => [f.name, (f as { value: FormValue }).value]));
const isEmpty = (v: FormValue | undefined) => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);

/**
 * The text drawn by the browser, which joins Arabic letters and sets them right to left, as a
 * picture for the PDF: its size in fractions of a page `size` points across and down.
 */
async function textPicture(text: string, sizePt: number, page: { width: number; height: number }) {
  const scale = 4;
  const lines = text.split(/\r?\n/);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `${sizePt * scale}px ${SANS}`;
  const widest = Math.max(1, ...lines.map((l) => context.measureText(l).width));
  canvas.width = Math.ceil(widest + sizePt * scale * 0.2);
  canvas.height = Math.ceil(lines.length * sizePt * scale * LINE_HEIGHT);
  const rtl = /[֐-ࣿ]/.test(text);
  context.font = `${sizePt * scale}px ${SANS}`;
  context.fillStyle = "#0d0d1a";
  context.textBaseline = "alphabetic";
  context.direction = rtl ? "rtl" : "ltr";
  context.textAlign = rtl ? "right" : "left";
  lines.forEach((line, i) => context.fillText(line, rtl ? canvas.width : 0, (i * LINE_HEIGHT + 0.9) * sizePt * scale));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("picture");
  return { png: new Uint8Array(await blob.arrayBuffer()), width: canvas.width / scale / page.width, height: canvas.height / scale / page.height };
}

function FillFile({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const format = useFormat();
  const problem = useFileProblem();
  const ids = { lock: useId(), fields: useId() };
  const [form, setForm] = useState<ReadForm | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const zoomBy = useCallback((step: 1 | -1) => setZoom((z) => ZOOMS[clamp(ZOOMS.indexOf(z) + step, 0, ZOOMS.length - 1)]), []);
  const [tool, setTool] = useState<Tool>("text");
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const nextId = useRef(1);
  const [asFields, setAsFields] = useState(false);
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // The page's size in points, as shown, once it is drawn: it sizes what is typed on it.
  const [shown, setShown] = useState<{ page: number; width: number; height: number } | null>(null);
  const drawn = useCallback((_: number, size: { width: number; height: number }) => setShown({ page, ...size }), [page]);

  // Read once for each file; the message for a problem is worded when it happens.
  const cannotRead = useEffectEvent((error: unknown) => setProblems([problem(pdf.name, error)]));
  useEffect(() => {
    let live = true;
    readForm(pdf.bytes)
      .then((read) => {
        if (!live) return;
        setForm(read);
        setValues(initial(read.fields));
      })
      .catch((error) => live && cannotRead(error));
    return () => {
      live = false;
    };
  }, [pdf]);

  // A form's own fields, filled in as far as they are, shown on the page shortly after each change.
  const ownFields = form?.fields.filter((f) => f.kind !== "button") ?? [];
  const [filled, setFilled] = useState<Uint8Array | null>(null);
  useEffect(() => {
    if (ownFields.length === 0) return;
    let live = true;
    const timer = setTimeout(() => {
      fillForm(pdf.bytes, values)
        .then((bytes) => live && setFilled(bytes))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ownFields.length, values, pdf.bytes]);
  const doc = usePdfDocument(filled ?? pdf.bytes);

  const missing = ownFields.filter((f) => f.required && !f.readOnly && isEmpty(values[f.name]));
  const focused = ownFields.find((f) => f.name === focus);
  const onPage = placed.filter((p) => p.page === page);
  const chosen = placed.find((p) => p.id === selected) ?? null;
  const written = placed.filter((p) => p.kind !== "text" || p.text.trim());

  const place = (x: number, y: number) => {
    const id = nextId.current++;
    const item: Placed =
      tool === "text"
        ? { id, kind: "text", page, x: clamp(x, 0, 0.95), y: clamp(y - 0.01, 0, 0.97), size: chosen?.kind === "text" ? chosen.size : TEXT_SIZE, text: "" }
        : { id, kind: tool, page, x: clamp(x, 0.01, 0.99), y: clamp(y, 0.01, 0.99), size: chosen && chosen.kind !== "text" ? chosen.size : MARK_SIZE, text: "" };
    // Text clicked away from before anything was typed in it is let go.
    setPlaced((all) => [...all.filter((p) => p.kind !== "text" || p.text.trim()), item]);
    setSelected(id);
  };
  const update = (id: number, change: Partial<Placed>) => setPlaced((all) => all.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const remove = (id: number) => {
    setPlaced((all) => all.filter((p) => p.id !== id));
    setSelected(null);
  };
  const resize = (by: number) => chosen && update(chosen.id, { size: clamp(chosen.size + by, 6, 48) });

  const run = async () => {
    setBusy(true);
    try {
      let bytes = ownFields.length > 0 ? await fillForm(pdf.bytes, values, { lock }) : pdf.bytes;
      const pages = new Map<number, { width: number; height: number }>();
      const items: WrittenItem[] = [];
      for (const p of written) {
        if (!pages.has(p.page) && doc) {
          const viewport = (await doc.getPage(p.page)).getViewport({ scale: 1 });
          pages.set(p.page, { width: viewport.width, height: viewport.height });
        }
        if (p.kind === "text") {
          const picture = LATIN.test(p.text) ? undefined : await textPicture(p.text, p.size, pages.get(p.page)!);
          items.push({ kind: "text", page: p.page - 1, x: p.x, y: p.y, size: p.size, text: p.text, picture });
        } else {
          items.push({ kind: p.kind, page: p.page - 1, x: p.x, y: p.y, size: p.size });
        }
      }
      bytes = await writeOnPdf(bytes, items, { asFields });
      downloadBytes(`${baseName(pdf.name)}-filled.pdf`, bytes);
      recordUse("pdf_fill");
      toast.success(t("files.ready"));
      setProblems([]);
    } catch (error) {
      setProblems([error instanceof FormLockError ? t("fill.lockNeedsLatin") : problem(pdf.name, error)]);
    } finally {
      setBusy(false);
    }
  };

  const ready = form !== null;
  const scale = shown?.page === page ? shown : null;
  const tools: { tool: Tool; icon: typeof Type }[] = [
    { tool: "text", icon: Type },
    { tool: "tick", icon: Check },
    { tool: "cross", icon: X },
    { tool: "dot", icon: Circle },
  ];

  return (
    <ToolPanel
      icon={FormInput}
      title={t("names.pdf_fill")}
      description={t("fill.hint")}
      footer={
        ready ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-3">
                <Switch id={ids.fields} checked={asFields} onCheckedChange={setAsFields} />
                <Label htmlFor={ids.fields} className="text-sm font-normal" title={t("fill.asFieldsHint")}>
                  {t("fill.asFields")}
                </Label>
              </div>
              {ownFields.length > 0 && (
                <div className="flex items-center gap-3">
                  <Switch id={ids.lock} checked={lock} onCheckedChange={setLock} />
                  <Label htmlFor={ids.lock} className="text-sm font-normal">
                    {t("fill.lock")}
                  </Label>
                </div>
              )}
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {missing.length > 0 ? t("fill.missing", { count: missing.length }) : t("fill.added", { count: written.length })}
              </span>
            </div>
            <Button size="lg" disabled={busy || (written.length === 0 && ownFields.length === 0)} onClick={run}>
              <FormInput />
              {busy ? t("files.working") : t("fill.action")}
            </Button>
          </>
        ) : undefined
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      {!ready && problems.length === 0 && <p className="text-sm text-muted-foreground">{t("fill.reading")}</p>}
      {form?.problem === "xfa" && <p className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">{t("fill.xfa")}</p>}
      {asFields && <p className="text-sm text-muted-foreground">{t("fill.asFieldsHint")}</p>}
      {ready && (
        <div className={cn("grid gap-8", ownFields.length > 0 && "lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]")}>
          {ownFields.length > 0 && (
            <section className="min-w-0 space-y-5" aria-label={t("fill.fields")}>
              <div>
                <h3 className="font-medium">{t("fill.fields")}</h3>
                <p className="text-sm text-muted-foreground">{t("fill.fieldsHint", { count: ownFields.length })}</p>
              </div>
              {lock && <p className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">{t("fill.lockHint")}</p>}
              {ownFields.map((field) => (
                <FormFieldControl
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? null}
                  onChange={(v) => setValues((all) => ({ ...all, [field.name]: v }))}
                  onFocus={() => {
                    setFocus(field.name);
                    if (field.spots[0]) setPage(field.spots[0].page + 1);
                  }}
                  active={field.name === focus}
                />
              ))}
            </section>
          )}

          <section className="min-w-0 space-y-3" aria-label={t("fill.pages")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="radiogroup" aria-label={t("fill.tool")} className="flex flex-wrap gap-1 rounded-lg border bg-background p-1">
                {tools.map(({ tool: value, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={tool === value}
                    variant={tool === value ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTool(value)}
                  >
                    <Icon />
                    {t(`fill.tools.${value}`)}
                  </Button>
                ))}
              </div>
              {chosen && (
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-muted-foreground">{t("fill.size")}</span>
                  <Button type="button" variant="outline" size="icon" onClick={() => resize(-1)} aria-label={t("fill.smaller")}>
                    <Minus />
                  </Button>
                  <span className="w-12 text-center tabular-nums">{t("fill.points", { size: format.number(chosen.size) })}</span>
                  <Button type="button" variant="outline" size="icon" onClick={() => resize(1)} aria-label={t("fill.larger")}>
                    <Plus />
                  </Button>
                </div>
              )}
              <Hint>
                {t(tool === "text" ? "fill.textHint" : "fill.markHint")} {t("fill.zoomHint")}
              </Hint>
              <div role="group" aria-label={t("fill.zoom")} className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" disabled={zoom === ZOOMS[0]} onClick={() => zoomBy(-1)} aria-label={t("fill.zoomOut")}>
                  <ZoomOut />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="w-16 tabular-nums" disabled={zoom === 1} onClick={() => setZoom(1)} title={t("fill.zoomFit")} aria-label={t("fill.zoomLevel", { percent: format.number(zoom * 100) })}>
                  {format.number(zoom * 100)}%
                </Button>
                <Button type="button" variant="outline" size="icon" disabled={zoom === ZOOMS.at(-1)} onClick={() => zoomBy(1)} aria-label={t("fill.zoomIn")}>
                  <ZoomIn />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("sign.previous")}>
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <span className="min-w-24 text-center text-sm" aria-live="polite">
                  {t("sign.pageOf", { page: format.number(page), pages: format.number(pdf.pages) })}
                </span>
                <Button variant="outline" size="icon" disabled={page >= pdf.pages} onClick={() => setPage(page + 1)} aria-label={t("sign.next")}>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </div>
            </div>
            <PdfPage doc={doc} page={page} label={t("fill.pageLabel", { page: format.number(page) })} onDrawn={drawn} zoom={zoom} onZoom={zoomBy}>
              {scale && (
                <PageLayer
                  tool={tool}
                  label={t("fill.placeLabel", { page: format.number(page), tool: t(`fill.tools.${tool}`) })}
                  onPlace={place}
                  onDeselect={() => setSelected(null)}
                >
                  {focused?.spots
                    .filter((s) => s.page === page - 1)
                    .map((s, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="pointer-events-none absolute rounded-sm bg-primary/15 ring-2 ring-primary"
                        style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }}
                      />
                    ))}
                  {onPage.map((item) => (
                    <PlacedItem
                      key={item.id}
                      item={item}
                      pageWidth={scale.width}
                      selected={item.id === selected}
                      onSelect={() => setSelected(item.id)}
                      onChange={(change) => update(item.id, change)}
                      onRemove={() => remove(item.id)}
                    />
                  ))}
                </PageLayer>
              )}
            </PdfPage>
          </section>
        </div>
      )}
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}

/** The page's surface: a click (or Enter, in its middle) puts the chosen thing there. */
function PageLayer({ tool, label, onPlace, onDeselect, children }: { tool: Tool; label: string; onPlace: (x: number, y: number) => void; onDeselect: () => void; children: ReactNode }) {
  return (
    // The page as a whole takes clicks and Enter; what is on it handles its own.
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className={cn("absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", tool === "text" ? "cursor-text" : "cursor-crosshair")}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const box = e.currentTarget.getBoundingClientRect();
        onDeselect();
        onPlace((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
        e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || e.key !== "Enter") return;
        e.preventDefault();
        onPlace(0.4, 0.45);
      }}
    >
      {children}
    </div>
  );
}

/** A tick, cross or dot, drawn as the PDF will draw it. */
function Mark({ kind }: { kind: "tick" | "cross" | "dot" }) {
  return (
    <svg viewBox="-0.5 -0.5 1 1" className="size-full overflow-visible" aria-hidden>
      {kind === "dot" ? (
        <circle r="0.22" fill="currentColor" />
      ) : (
        <path d={kind === "tick" ? "M -0.38 -0.02 L -0.12 0.3 L 0.4 -0.36" : "M -0.34 0.34 L 0.34 -0.34 M -0.34 -0.34 L 0.34 0.34"} fill="none" stroke="currentColor" strokeWidth="0.12" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Text or a mark on the page: dragged by its handle (or the mark itself), moved by the arrows, removed with Delete. */
function PlacedItem({
  item,
  pageWidth,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  item: Placed;
  pageWidth: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (change: Partial<Placed>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("tools.fill");
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ x: number; y: number; start: Placed; page: DOMRect } | null>(null);
  // Points on the page as pixels on the screen: the page's width as drawn over its width in points.
  const [perPoint, setPerPoint] = useState(1);
  useEffect(() => {
    const layer = box.current?.parentElement;
    if (!layer) return;
    const measure = () => setPerPoint(layer.getBoundingClientRect().width / pageWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [pageWidth]);
  // New text is typed into at once.
  useEffect(() => {
    if (item.kind === "text" && selected && !item.text) editor.current?.focus();
  }, [item.kind, item.text, selected]);

  const begin = (e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: item, page: box.current!.parentElement!.getBoundingClientRect() };
  };
  const follow = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    onChange({ x: clamp(d.start.x + (e.clientX - d.x) / d.page.width, 0, 1), y: clamp(d.start.y + (e.clientY - d.y) / d.page.height, 0, 1) });
  };
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.005, 0], ArrowRight: [0.005, 0], ArrowUp: [0, -0.005], ArrowDown: [0, 0.005] };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove();
    } else if (moves[e.key]) {
      e.preventDefault();
      onChange({ x: clamp(item.x + moves[e.key][0], 0, 1), y: clamp(item.y + moves[e.key][1], 0, 1) });
    }
  };
  const fontSize = item.size * perPoint;
  const remove = (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onRemove}
      aria-label={t("remove")}
      className={cn("absolute -end-3 -top-3 hidden size-5 items-center justify-center rounded-full bg-destructive text-white shadow", selected && "flex")}
    >
      <X className="size-3" />
    </button>
  );

  if (item.kind !== "text") {
    const side = item.size * perPoint;
    return (
      <div
        ref={box}
        className="absolute"
        style={{ left: `calc(${item.x * 100}% - ${side / 2}px)`, top: `calc(${item.y * 100}% - ${side / 2}px)`, width: side, height: side }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={t("markLabel", { mark: t(`tools.${item.kind}`) })}
          aria-describedby={`fill-keys-${item.id}`}
          aria-pressed={selected}
          onPointerDown={begin}
          onPointerMove={follow}
          onPointerUp={() => (drag.current = null)}
          onFocus={onSelect}
          onKeyDown={keys}
          className={cn("size-full cursor-move touch-none rounded-sm text-[#0d0d1a] outline-none", selected && "ring-2 ring-primary/70")}
        >
          <Mark kind={item.kind} />
        </div>
        <span id={`fill-keys-${item.id}`} className="sr-only">
          {t("keys")}
        </span>
        {remove}
      </div>
    );
  }

  return (
    <div
      ref={box}
      className={cn("group absolute rounded-sm", selected ? "ring-2 ring-primary/70" : "hover:ring-1 hover:ring-primary/40")}
      style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <span
        aria-hidden
        onPointerDown={begin}
        onPointerMove={follow}
        onPointerUp={() => (drag.current = null)}
        className={cn("absolute -start-5 top-0 hidden cursor-move touch-none rounded bg-primary p-0.5 text-primary-foreground", (selected || !item.text) && "block", "group-hover:block")}
      >
        <GripVertical className="size-3.5" />
      </span>
      {/* The text sizes its box; the editor lies over it, so the box always fits what is typed. */}
      <div className="relative" style={{ fontFamily: SANS, fontSize, lineHeight: LINE_HEIGHT }}>
        <span aria-hidden className="invisible block min-w-[4em] whitespace-pre" dir="auto">
          {(item.text || " ") + "​"}
        </span>
        <textarea
          ref={editor}
          value={item.text}
          dir="auto"
          aria-label={t("textLabel")}
          aria-describedby={`fill-keys-${item.id}`}
          spellCheck={false}
          onFocus={onSelect}
          onChange={(e) => onChange({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.currentTarget.blur();
            if (e.key === "Delete" && !item.text) onRemove();
          }}
          className="absolute inset-0 resize-none overflow-hidden bg-transparent p-0 text-[#0d0d1a] outline-none"
          style={{ font: "inherit", lineHeight: "inherit" }}
        />
      </div>
      <span id={`fill-keys-${item.id}`} className="sr-only">
        {t("textKeys")}
      </span>
      {remove}
    </div>
  );
}
