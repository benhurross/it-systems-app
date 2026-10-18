"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
export function PdfPage({
  doc,
  page,
  label,
  onDrawn,
  children,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  label: string;
  /** Called once it is drawn with the page's width over its height, and its size in points, as shown. */
  onDrawn?: (aspect: number, size: { width: number; height: number }) => void;
  children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      try {
        const p = await doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: (1100 * (window.devicePixelRatio > 1 ? 1.5 : 1)) / Math.max(base.width, base.height) });
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
  }, [doc, page, onDrawn]);

  return (
    <div className="flex justify-center rounded-xl border bg-muted/40 p-3 sm:p-4">
      {/* The page reads left to right whatever the app's language; what lies on it is placed by fractions of its size. */}
      <div dir="ltr" className={cn("relative max-w-full", aspect === null ? "w-full max-w-md" : "w-fit")}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          className={cn("block h-auto max-h-[70vh] w-auto max-w-full bg-white shadow-sm ring-1 ring-border", aspect === null && "aspect-[3/4] w-full animate-pulse bg-muted")}
        />
        {aspect !== null && children}
      </div>
    </div>
  );
}
