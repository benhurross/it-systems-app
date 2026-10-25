"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// pdf.js draws page thumbnails; it is loaded only when a tool needs it, with its worker beside it.
// Its "legacy" build carries what older browsers lack (the plain build fails in some still in use).
let lib: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
export function loadPdfJs() {
  lib ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    return m;
  });
  return lib;
}

/**
 * One worker for every PDF opened. pdf.js shuts down the worker a document was opened with when
 * that document is closed; a worker it is given stays up, so a page shown again with new contents
 * (a form filled in, say) is not left waiting on one that is shutting down.
 */
let worker: import("pdfjs-dist").PDFWorker | null = null;
export async function openPdf(bytes: Uint8Array) {
  const m = await loadPdfJs();
  worker ??= m.PDFWorker.create({ port: m.GlobalWorkerOptions.workerPort ?? undefined });
  // pdf.js takes the buffer it is given, so it gets a copy.
  return m.getDocument({ data: bytes.slice(), worker }).promise;
}

/** A PDF opened for showing its pages; null until it is open, or if it cannot be. */
export function usePdfDocument(bytes: Uint8Array | null) {
  const [opened, setOpened] = useState<{ bytes: Uint8Array; doc: PDFDocumentProxy } | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let live = true;
    let doc: PDFDocumentProxy | null = null;
    openPdf(bytes)
      .then((d) => {
        doc = d;
        if (live) setOpened({ bytes, doc: d });
        else void d.destroy();
      })
      .catch(() => {});
    return () => {
      live = false;
      void doc?.destroy();
    };
  }, [bytes]);
  // A document opened for other bytes is never shown for these.
  return opened && opened.bytes === bytes ? opened.doc : null;
}

/**
 * One page drawn small, `size` pixels on its longer side, turned by `turn` degrees on top of its own turn.
 * It is drawn once it scrolls into view, so long PDFs open quickly. Without a label it is
 * decoration, for when what surrounds it already says which page it is.
 */
export function PdfThumb({
  doc,
  page,
  turn = 0,
  size = 180,
  label,
  className,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  turn?: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!doc || !visible) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      // A page that cannot be drawn, or a document closed meanwhile, just stays a placeholder.
      try {
        const p = await doc.getPage(page);
        const rotation = (((p.rotate + turn) % 360) + 360) % 360;
        const base = p.getViewport({ scale: 1, rotation });
        const viewport = p.getViewport({ scale: (size * (window.devicePixelRatio || 1)) / Math.max(base.width, base.height), rotation });
        const el = canvas.current;
        if (!el || cancelled) return;
        el.width = Math.floor(viewport.width);
        el.height = Math.floor(viewport.height);
        task = p.render({ canvas: el, viewport });
        await task.promise;
        if (!cancelled) setDrawn(true);
      } catch {}
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, turn, size, visible]);

  return (
    <canvas
      ref={canvas}
      // Canvas text takes the page's direction; PDFs are drawn glyph by glyph, left to right.
      dir="ltr"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("mx-auto block h-auto max-h-full w-auto max-w-full bg-white shadow-sm ring-1 ring-border", !drawn && "aspect-[3/4] w-full animate-pulse bg-muted", className)}
    />
  );
}

/**
 * One page drawn large, as large as fits across and no taller than most of the window, with
 * things laid over it (in fractions of its size) once it is drawn. A page drawn again, as a form
 * is filled in, replaces the last only when it is ready, so it never flashes blank.
 */
/** The longest side a page is drawn at, in canvas pixels: browsers refuse much larger canvases. */
const MAX_CANVAS = 6000;

export function PdfPage({
  doc,
  page,
  label,
  onDrawn,
  zoom,
  onZoom,
  pan,
  tall,
  children,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  label: string;
  /** Called once it is drawn with the page's width over its height, and its size in points, as shown. */
  onDrawn?: (aspect: number, size: { width: number; height: number }) => void;
  /**
   * How much larger than fitting the space to show the page (1 fits it); the page scrolls when it
   * is larger. Left out, the page always fits.
   */
  zoom?: number;
  /** Ctrl and the mouse wheel (or a pinch on a touchpad) over the page: 1 to zoom in, -1 out. */
  onZoom?: (step: 1 | -1) => void;
  /** Dragging the page with the mouse moves it, like a map; a click that does not drag still clicks. */
  pan?: boolean;
  /** Fits the page to the space across, and the view to most of the window's height, for a drawing to look round. */
  tall?: boolean;
  children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  // The page's width when it fits: the space across, or 70% of the window's height, whichever is less.
  const [fit, setFit] = useState<number | null>(null);
  const zooming = zoom !== undefined;
  const scale = zoom ?? 1;

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const longest = Math.max(base.width, base.height);
        // Drawn finer as it is zoomed, so it stays sharp.
        const pixels = Math.min(MAX_CANVAS, 1100 * (window.devicePixelRatio > 1 ? 1.5 : 1) * scale);
        const viewport = p.getViewport({ scale: pixels / longest });
        const drawing = document.createElement("canvas");
        drawing.width = Math.floor(viewport.width);
        drawing.height = Math.floor(viewport.height);
        // Form fields drawn as the PDF says they look, answers and all, as they print: pdf.js
        // otherwise leaves them off the page, for a layer of its own the app does not use.
        const { AnnotationMode } = await loadPdfJs();
        task = p.render({ canvas: drawing, viewport, annotationMode: AnnotationMode.ENABLE });
        await task.promise;
        const el = canvas.current;
        if (!el || cancelled) return;
        el.width = drawing.width;
        el.height = drawing.height;
        el.getContext("2d")!.drawImage(drawing, 0, 0);
        setAspect(viewport.width / viewport.height);
        onDrawn?.(viewport.width / viewport.height, { width: base.width, height: base.height });
      } catch {}
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, onDrawn, scale]);

  useEffect(() => {
    if (!zooming || !aspect || !room.current) return;
    const measure = () => setFit(tall ? room.current!.clientWidth : Math.min(room.current!.clientWidth, window.innerHeight * 0.7 * aspect));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [zooming, aspect, tall]);

  // The point in the middle of the view stays there as the page grows or shrinks: the scroll
  // position is still where it was, over a page of the size before.
  const before = useRef<{ scale: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = before.current;
    if (last && last.scale !== scale) {
      el.scrollLeft = ((el.scrollLeft + el.clientWidth / 2) / last.width) * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = ((el.scrollTop + el.clientHeight / 2) / last.height) * el.scrollHeight - el.clientHeight / 2;
    }
    before.current = { scale, width: el.scrollWidth, height: el.scrollHeight };
  }, [scale, fit]);

  // A wheel listener that may stop the browser zooming the whole app, which React's cannot.
  const zoomBy = useEffectEvent((step: 1 | -1) => onZoom?.(step));
  useEffect(() => {
    const el = scroller.current;
    if (!el || !onZoom) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onZoom]);

  // Where a drag began, and whether it has moved far enough to be one rather than a click.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const panning = pan
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          const el = e.currentTarget;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
        },
        onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 5) return;
          if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
          d.moved = true;
          e.currentTarget.scrollLeft = d.left - dx;
          e.currentTarget.scrollTop = d.top - dy;
        },
        onPointerUp: () => {
          // The click that ends a drag is not one; it is let go of on the next frame.
          if (drag.current?.moved) requestAnimationFrame(() => (drag.current = null));
          else drag.current = null;
        },
        onClickCapture: (e: ReactMouseEvent) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
      }
    : {};

  const page_ = (
    // The page reads left to right whatever the app's language; what lies on it is placed by fractions of its size.
    <div dir="ltr" className={cn("relative", zooming ? "mx-auto" : "max-w-full", aspect === null ? "w-full max-w-md" : "w-fit")}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        style={zooming && aspect !== null && fit !== null ? { width: fit * scale, height: (fit * scale) / aspect } : undefined}
        className={cn(
          "block bg-white shadow-sm ring-1 ring-border",
          !zooming && "h-auto max-h-[70vh] w-auto max-w-full",
          aspect === null && "aspect-[3/4] w-full animate-pulse bg-muted",
        )}
      />
      {aspect !== null && children}
    </div>
  );
  if (!zooming) return <div className="flex justify-center rounded-xl border bg-muted/40 p-3 sm:p-4">{page_}</div>;
  return (
    <div
      ref={scroller}
      data-pdf-scroller
      {...panning}
      className={cn("overflow-auto overscroll-contain rounded-xl border bg-muted/40 p-3 sm:p-4", tall ? "h-[75vh]" : "max-h-[75vh]", pan && "cursor-grab active:cursor-grabbing")}
    >
      {/* Measures the space across; the page inside may be wider and scroll. */}
      <div ref={room} className="w-full">
        {page_}
      </div>
    </div>
  );
}
