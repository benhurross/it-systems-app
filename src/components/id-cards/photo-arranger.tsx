"use client";

import { Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { CARD, type Line, PHOTO, PHOTO_PIXELS } from "@/lib/id-card";
import { CardFace, CardPhoto, type Placement } from "./card-face";

/** The chosen photo, redrawn upright and no larger than needed, ready to place and crop. */
type Source = { url: string; canvas: HTMLCanvasElement; width: number; height: number; pixels: number };
type View = { zoom: number; dx: number; dy: number };

const MAX_SOURCE = 2000;
const MAX_ZOOM = 4;
export const PHOTO_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photoType"))), type, 0.92));

/** Reads a chosen file as an image, or explains why it cannot be used. */
async function prepare(file: File): Promise<Source> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("fileSize");
  const type = sniffType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (type !== "image/jpeg" && type !== "image/png") throw new Error("photoType");
  const original = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = original;
    await img.decode().catch(() => {
      throw new Error("photoType");
    });
    // Browsers turn phone photos upright as they draw them; drawing once keeps that everywhere.
    const scale = Math.min(1, MAX_SOURCE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(await toBlob(canvas, "image/jpeg"));
    return { url, canvas, width: canvas.width, height: canvas.height, pixels: Math.min(img.naturalWidth, img.naturalHeight) };
  } finally {
    URL.revokeObjectURL(original);
  }
}

/** The view kept within bounds: the photo always covers the whole window. */
function bounded(source: Source, view: View): View {
  const zoom = Math.min(Math.max(view.zoom, 1), MAX_ZOOM);
  const k = (PHOTO.size * zoom) / Math.min(source.width, source.height);
  const maxX = (source.width * k - PHOTO.size) / 2;
  const maxY = (source.height * k - PHOTO.size) / 2;
  return { zoom, dx: Math.min(Math.max(view.dx, -maxX), maxX), dy: Math.min(Math.max(view.dy, -maxY), maxY) };
}

function placementOf(source: Source, view: View): Placement {
  const k = (PHOTO.size * view.zoom) / Math.min(source.width, source.height);
  const width = source.width * k;
  const height = source.height * k;
  return { x: PHOTO.x + (PHOTO.size - width) / 2 + view.dx, y: PHOTO.y + (PHOTO.size - height) / 2 + view.dy, width, height };
}

// Faces sit high in most portraits, so a tall photo starts halfway to its top.
function start(source: Source): View {
  const top = bounded(source, { zoom: 1, dx: 0, dy: Infinity });
  return { ...top, dy: top.dy / 2 };
}

/** A photo being placed in the card's photo window: choose, move, zoom, then save as a square. */
export function usePhotoArranger() {
  const [source, setSource] = useState<Source | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, dx: 0, dy: 0 });

  useEffect(() => () => void (source && URL.revokeObjectURL(source.url)), [source]);

  return {
    source,
    view,
    placement: source ? placementOf(source, view) : null,
    /** Too few of the photo's own pixels fill the window to print sharp. */
    small: source ? source.pixels / view.zoom < PHOTO_PIXELS.needed : false,
    async choose(file: File) {
      const next = await prepare(file);
      setSource(next);
      setView(start(next));
    },
    clear: () => setSource(null),
    move: (dx: number, dy: number) => source && setView((v) => bounded(source, { ...v, dx: v.dx + dx, dy: v.dy + dy })),
    zoomTo: (zoom: number) => source && setView((v) => bounded(source, { ...v, zoom })),
    reset: () => source && setView(start(source)),
    /** The window's content as a square JPEG, as the card prints it. */
    async save(): Promise<Blob> {
      if (!source) throw new Error("fileEmpty");
      const p = placementOf(source, view);
      const size = PHOTO_PIXELS.saved;
      const f = size / PHOTO.size;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source.canvas, (p.x - PHOTO.x) * f, (p.y - PHOTO.y) * f, p.width * f, p.height * f);
      return toBlob(canvas, "image/jpeg");
    },
  };
}

export type Arranger = ReturnType<typeof usePhotoArranger>;

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * The front of the card with the photo to arrange in its window: drag it, or use the arrow keys,
 * and zoom with the slider, the buttons, + and − or the mouse wheel.
 */
export function ArrangeOnCard({ arranger, design, lines, label }: { arranger: Arranger; design: string | null; lines: Line[] | null; label: string }) {
  const t = useTranslations("idCards");
  const { source, view, placement } = arranger;
  const frame = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const hintId = useId();
  const zoomId = useId();

  // Wheel zoom needs a listener that may stop the page scrolling, which React's cannot.
  const zoomTo = arranger.zoomTo;
  const zoom = view.zoom;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo, zoom]);

  /** Card units per screen pixel, as the card is drawn now. */
  const unit = () => CARD.width / (wrapper.current?.getBoundingClientRect().width || CARD.width);

  return (
    <div className="space-y-3">
      <div ref={wrapper} className="relative">
        <CardFace
          side="front"
          design={design}
          lines={lines}
          label={label}
          photo={source && placement && <CardPhoto src={source.url} placement={placement} ghost={active} />}
        />
        {source && (
          <div
            ref={frame}
            role="group"
            tabIndex={0}
            aria-label={t("photoPosition")}
            aria-describedby={hintId}
            className="absolute cursor-grab touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring active:cursor-grabbing"
            style={{
              left: pct(PHOTO.x, CARD.width),
              top: pct(PHOTO.y, CARD.height),
              width: pct(PHOTO.size, CARD.width),
              height: pct(PHOTO.size, CARD.height),
              borderRadius: `${(PHOTO.radius / PHOTO.size) * 100}%`,
            }}
            onFocus={() => setActive(true)}
            onBlur={() => setActive(false)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY };
              setActive(true);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const u = unit();
              arranger.move((e.clientX - drag.current.x) * u, (e.clientY - drag.current.y) * u);
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => {
              drag.current = null;
              if (document.activeElement !== frame.current) setActive(false);
            }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 5 : 1;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              if (moves[e.key]) arranger.move(...moves[e.key]);
              else if (e.key === "+" || e.key === "=") arranger.zoomTo(view.zoom * 1.1);
              else if (e.key === "-" || e.key === "_") arranger.zoomTo(view.zoom / 1.1);
              else return;
              e.preventDefault();
            }}
          />
        )}
      </div>
      {source && (
        <>
          <p id={hintId} className="text-xs text-muted-foreground">
            {t("arrangeHint")}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor={zoomId} className="text-sm font-medium">
              {t("zoom")}
            </label>
            <Button type="button" variant="outline" size="icon-sm" aria-label={t("zoomOut")} disabled={view.zoom <= 1} onClick={() => arranger.zoomTo(view.zoom / 1.1)}>
              <Minus />
            </Button>
            <input
              id={zoomId}
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(e) => arranger.zoomTo(Number(e.target.value))}
              className="min-w-0 flex-1 accent-primary"
            />
            <Button type="button" variant="outline" size="icon-sm" aria-label={t("zoomIn")} disabled={view.zoom >= MAX_ZOOM} onClick={() => arranger.zoomTo(view.zoom * 1.1)}>
              <Plus />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("resetPhoto")} onClick={arranger.reset}>
              <RotateCcw />
            </Button>
          </div>
          {arranger.small && (
            <p className="flex items-start gap-2 text-sm text-warning" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("photoSmallWarning")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const ERRORS = ["fileEmpty", "fileSize", "photoType", "photoShape", "photoSmall", "cardWaiting"] as const;

/** An error from choosing or sending a photo, in the reader's language. */
export function usePhotoError() {
  const t = useTranslations("idCards.errors");
  return (key: string) => t((ERRORS as readonly string[]).includes(key) ? (key as (typeof ERRORS)[number]) : "generic");
}

/** Choosing the photo file, with what makes a good one and anything wrong with the choice. */
export function PhotoInput({ arranger, error, onError }: { arranger: Arranger; error: string | null; onError: (message: string | null) => void }) {
  const t = useTranslations("idCards");
  const explain = usePhotoError();
  const inputId = useId();
  const tipsId = useId();
  const errorId = useId();
  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {arranger.source ? t("changePhoto") : t("choosePhoto")}
      </label>
      <Input
        id={inputId}
        type="file"
        accept={PHOTO_ACCEPT}
        aria-describedby={error ? `${tipsId} ${errorId}` : tipsId}
        aria-invalid={error ? true : undefined}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          onError(null);
          if (!file) return;
          try {
            await arranger.choose(file);
          } catch (err) {
            onError(explain(err instanceof Error ? err.message : ""));
          }
        }}
      />
      <ul id={tipsId} className="list-disc space-y-0.5 ps-5 text-xs text-muted-foreground">
        <li>{t("tips.recent")}</li>
        <li>{t("tips.background")}</li>
        <li>{t("tips.files")}</li>
      </ul>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
