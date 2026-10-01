"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// pdf.js draws page thumbnails; it is loaded only when a tool needs it, with its worker beside it.
// Its "legacy" build carries what older browsers lack (the plain build fails in some still in use).
let lib: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
function pdfjs() {
  lib ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    return m;
  });
  return lib;
}

/** A PDF opened for showing its pages; null until it is open, or if it cannot be. */
export function usePdfDocument(bytes: Uint8Array | null) {
  const [opened, setOpened] = useState<{ bytes: Uint8Array; doc: PDFDocumentProxy } | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let live = true;
    let doc: PDFDocumentProxy | null = null;
    // pdf.js takes the buffer it is given, so it gets a copy.
    pdfjs()
      .then((m) => m.getDocument({ data: bytes.slice() }).promise)
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
