"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CARD,
  CARD_FONTS,
  type CardFont,
  type CardSide,
  type CardText,
  FONT_FILES,
  layoutCard,
  type Line,
  type Measure,
  PHOTO,
  TEXT,
} from "@/lib/id-card";

const FAMILY: Record<CardFont, string> = { regular: "AP Card Regular", narrow: "AP Card Narrow" };

// The card's own fonts, the same files the printed card embeds, loaded once when a card is shown.
let fontsReady = false;
let loading: Promise<void> | null = null;
function loadCardFonts() {
  loading ??= Promise.all(
    CARD_FONTS.flatMap((font) =>
      (["regular", "bold"] as const).map(async (weight) => {
        const face = new FontFace(FAMILY[font], `url(/fonts/id-card/${FONT_FILES[font][weight]})`, { weight: weight === "bold" ? "700" : "400" });
        document.fonts.add(await face.load());
      }),
    ),
  ).then(() => {
    fontsReady = true;
  });
  return loading;
}

let context: CanvasRenderingContext2D | null = null;
/** Widths as the browser draws the card fonts, without kerning, as the PDF sets them. */
const measure: Measure = (text, font, bold, size) => {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return text.length * size * 0.5;
  context.fontKerning = "none";
  // Measured large and scaled down, clear of any minimum font size.
  context.font = `${bold ? 700 : 400} ${size * 10}px "${FAMILY[font]}"`;
  return context.measureText(text).width / 10;
};

/** The front's lines, placed exactly as the printed card places them; null until the fonts load. */
export function useCardLines(card: CardText | null): Line[] | null {
  const [ready, setReady] = useState(fontsReady);
  useEffect(() => {
    let live = true;
    // Without the fonts the preview still shows, in the nearest fonts the browser has.
    const done = () => live && setReady(true);
    loadCardFonts().then(done, done);
    return () => {
      live = false;
    };
  }, []);
  return ready && card ? layoutCard(card, measure) : null;
}

/** Where an image sits on the card, in card units. */
export type Placement = { x: number; y: number; width: number; height: number };

/** A photo on the card, clipped to the rounded photo window; `ghost` also shows the rest faded. */
export function CardPhoto({ src, placement = PHOTO_FRAME, ghost }: { src: string; placement?: Placement; ghost?: boolean }) {
  const clip = `card-photo-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.size} height={PHOTO.size} rx={PHOTO.radius} />
        </clipPath>
      </defs>
      {ghost && <image href={src} {...placement} preserveAspectRatio="none" opacity={0.35} />}
      <image href={src} {...placement} preserveAspectRatio="none" clipPath={`url(#${clip})`} />
    </>
  );
}

const PHOTO_FRAME: Placement = { x: PHOTO.x, y: PHOTO.y, width: PHOTO.size, height: PHOTO.size };

/**
 * One side of the card at its true proportions: the company design, the photo and the text, as
 * the printed card will have them. Without a design, a plain card shows where things go.
 */
export function CardFace({
  side,
  design,
  lines,
  photo,
  label,
  className,
}: {
  side: CardSide;
  design: string | null;
  lines?: Line[] | null;
  photo?: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${CARD.width} ${CARD.height}`}
      role="img"
      aria-label={label}
      // The card's text is always left to right, on an Arabic page too.
      direction="ltr"
      // CR80 cards have 3.18 mm corners.
      style={{ borderRadius: "5.9% / 3.7%" }}
      className={cn("block h-auto w-full bg-white shadow-sm ring-1 ring-border", className)}
    >
      {design ? (
        <image href={design} width={CARD.width} height={CARD.height} preserveAspectRatio="none" />
      ) : (
        side === "front" && (
          <rect x={PHOTO.x} y={PHOTO.y} width={PHOTO.size} height={PHOTO.size} rx={PHOTO.radius} fill="#f4f4f5" stroke="#a1a1aa" strokeDasharray="3 2" strokeWidth={0.75} />
        )
      )}
      {side === "front" && photo}
      {side === "front" &&
        lines?.map((line) => (
          <text
            key={`${line.y}-${line.text}`}
            x={TEXT.centre}
            y={line.y}
            textAnchor="middle"
            fontFamily={`"${FAMILY[line.font]}", Arial, sans-serif`}
            fontWeight={line.bold ? 700 : 400}
            fontSize={line.size}
            fill="#231f20"
            style={{ fontKerning: "none" }}
          >
            {line.text}
          </text>
        ))}
    </svg>
  );
}

/** The current design image for a side, addressed by its upload time so browsers keep it until replaced. */
export function designUrl(design: Partial<Record<CardSide, { updatedAt: string } | null>> | undefined, side: CardSide) {
  const current = design?.[side];
  return current ? `/api/id-cards/design/${side}?v=${encodeURIComponent(current.updatedAt)}` : null;
}
