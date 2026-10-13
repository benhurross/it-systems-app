"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useState } from "react";
import { loadPdfJs, PdfThumb } from "@/components/tools/pdf-preview";
import type { LibraryDeck } from "@/lib/api-types";
import { isDark } from "@/lib/presentations";
import { cn } from "@/lib/utils";

// Pictures of slides: a library deck's slides drawn from its PDF, and the slides the app makes
// (the cover and people's own slides) drawn here as they will come out in PowerPoint.

/** Each deck's PDF, opened once however many of its slides are on the page. */
const opened = new Map<string, Promise<PDFDocumentProxy>>();

const previewUrl = (deck: Pick<LibraryDeck, "id" | "version">) => `/api/presentations/decks/${deck.id}/preview?v=${deck.version}`;

function openPdf(url: string) {
  let doc = opened.get(url);
  if (!doc) {
    doc = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = new Uint8Array(await res.arrayBuffer());
      return (await loadPdfJs()).getDocument({ data }).promise;
    })();
    // A failed load is tried again next time.
    doc.catch(() => opened.delete(url));
    opened.set(url, doc);
  }
  return doc;
}

/** A library deck's PDF, for drawing its slides; null until it is open. */
export function useDeckPdf(deck: Pick<LibraryDeck, "id" | "version"> | null | undefined) {
  const url = deck ? previewUrl(deck) : null;
  const [state, setState] = useState<{ url: string; doc: PDFDocumentProxy } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    openPdf(url)
      .then((doc) => live && setState({ url, doc }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return state && state.url === url ? state.doc : null;
}

/** A slide in a 16:9 frame. */
export function SlideFrame({ children, className, dimmed }: { children: React.ReactNode; className?: string; dimmed?: boolean }) {
  return (
    <div className={cn("relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border", dimmed && "opacity-40 grayscale", className)}>
      {children}
    </div>
  );
}

/** One of a library deck's slides, drawn from its PDF (page `index` + 1). */
export function DeckSlide({ doc, index, size = 320, label }: { doc: PDFDocumentProxy | null; index: number; size?: number; label?: string }) {
  return <PdfThumb doc={doc} page={index + 1} size={size} label={label} className="max-h-full w-full shadow-none ring-0" />;
}

/** The company logo for a background: white on a dark colour. */
const logo = (dark: boolean) => (dark ? "/brand/applus-white.svg" : "/brand/applus-logo.svg");

export type CoverText = { title: string; client: string; contact?: string | null; date?: string | null; presenter?: string | null };

/**
 * The cover as the app makes it in PowerPoint: the deck's colour (over its picture, if it has
 * one), the logo, the title, who it is for, and when and by whom. Sizes follow the slide's width.
 */
export function CoverSlide({ color, imageUrl, text, label }: { color: string; imageUrl: string | null; text: CoverText; label?: string }) {
  const dark = isDark(color);
  const footer = [text.date, text.presenter].filter(Boolean).join("   ·   ");
  const width = imageUrl ? "49.5%" : "61.5%";
  return (
    <div
      // A picture of a slide: named when it stands alone, else decoration beside its name.
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dir="ltr"
      className="@container relative aspect-video w-full overflow-hidden rounded-md ring-1 ring-border"
      style={{ backgroundColor: `#${color}`, color: dark ? "#fff" : "#1F2937" }}
    >
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture from the API, at its own size */}
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-y-0 start-0 w-[60%]" style={{ backgroundColor: `#${color}`, opacity: 0.9 }} />
        </>
      ) : (
        <>
          <span className={cn("absolute top-[-21%] left-[63%] aspect-square w-[54%] rounded-full", dark ? "bg-white/[0.07]" : "bg-black/[0.07]")} />
          <span className={cn("absolute top-[52%] left-[76.5%] aspect-square w-[34.5%] rounded-full", dark ? "bg-white/[0.07]" : "bg-black/[0.07]")} />
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- the logo, sized by the slide */}
      <img src={logo(dark)} alt="" className="absolute top-[8%] left-[5.6%] h-[12.7%] w-auto" />
      <p dir="auto" className="absolute top-[28%] left-[5.6%] flex h-[22.7%] items-end text-[3.75cqw] leading-tight font-bold" style={{ width }}>
        <span className="line-clamp-2">{text.title}</span>
      </p>
      <p className="absolute top-[54%] left-[5.6%] text-[1.46cqw] opacity-80">Prepared for</p>
      <p dir="auto" className="absolute top-[59.3%] left-[5.6%] truncate text-[2.92cqw] font-bold" style={{ width }}>
        {text.client}
      </p>
      {text.contact && (
        <p dir="auto" className="absolute top-[69.3%] left-[5.6%] truncate text-[1.67cqw] opacity-90" style={{ width }}>
          {text.contact}
        </p>
      )}
      {footer && (
        <p dir="auto" className="absolute top-[86%] left-[5.6%] text-[1.35cqw] whitespace-pre opacity-85">
          {footer}
        </p>
      )}
    </div>
  );
}

/** One of the salesperson's own slides, as drawn plain: a title, its points, and a picture. */
export function OwnSlide({ color, title, body, imageUrl, label }: { color: string; title: string; body: string; imageUrl: string | null; label?: string }) {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dir="ltr"
      className="@container relative aspect-video w-full overflow-hidden rounded-md bg-white text-[#374151] ring-1 ring-border"
    >
      <p dir="auto" className="absolute top-[6%] right-[4.5%] left-[4.5%] truncate text-[2.92cqw] font-bold" style={{ color: `#${color}` }}>
        {title}
      </p>
      <ul className={cn("absolute top-[21%] bottom-[12%] left-[4.5%] space-y-[0.8cqw] overflow-hidden text-[1.88cqw]", imageUrl ? "w-[48%]" : "right-[4.5%]")}>
        {lines.map((line, i) => (
          <li key={i} dir="auto" className={cn(lines.length > 1 && "list-disc ms-[2cqw]")}>
            {line}
          </li>
        ))}
      </ul>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- the salesperson's own picture
        <img src={imageUrl} alt="" className="absolute top-[21%] right-[4.5%] h-[67%] w-[38%] object-contain" />
      )}
    </div>
  );
}
