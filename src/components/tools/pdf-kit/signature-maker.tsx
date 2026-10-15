"use client";

import { Eraser, ImageUp, PenLine, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { FileDrop } from "@/components/tools/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** A signature ready to place: a PNG with a clear background, and its width over its height. */
export type Signature = { png: Uint8Array; url: string; ratio: number };

const INKS = { black: "#111827", blue: "#1e3a8a" } as const;
type Ink = keyof typeof INKS;
/** Handwriting fonts most computers have, best first; the browser's own cursive font otherwise. */
const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Apple Chancery', cursive";

/** The canvas cut to what is drawn on it, with a little space round it; null if it is empty. */
function trimmed(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const context = source.getContext("2d")!;
  const { data, width, height } = context.getImageData(0, 0, source.width, source.height);
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return null;
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.04) + 2;
  [left, top] = [Math.max(0, left - pad), Math.max(0, top - pad)];
  [right, bottom] = [Math.min(width - 1, right + pad), Math.min(height - 1, bottom + pad)];
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(source, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function asSignature(canvas: HTMLCanvasElement | null): Promise<Signature | null> {
  const cut = canvas && trimmed(canvas);
  if (!cut) return null;
  const blob = await new Promise<Blob | null>((resolve) => cut.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob), ratio: cut.width / cut.height };
}

/** Making a signature: drawn with a mouse, finger or pen, typed, or a photo or scan of one. */
export function SignatureMaker({ onChange }: { onChange: (signature: Signature | null) => void }) {
  const t = useTranslations("tools.sign");
  const [ink, setInk] = useState<Ink>("blue");
  return (
    <Tabs defaultValue="draw" onValueChange={() => onChange(null)} className="gap-4">
      <TabsList>
        <TabsTrigger value="draw">
          <PenLine />
          {t("draw")}
        </TabsTrigger>
        <TabsTrigger value="type">
          <Type />
          {t("type")}
        </TabsTrigger>
        <TabsTrigger value="upload">
          <ImageUp />
          {t("upload")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="draw" className="space-y-3">
        <Inks value={ink} onChange={setInk} />
        <DrawPad ink={INKS[ink]} onChange={onChange} />
      </TabsContent>
      <TabsContent value="type" className="space-y-3">
        <Inks value={ink} onChange={setInk} />
        <Typed ink={INKS[ink]} onChange={onChange} />
      </TabsContent>
      <TabsContent value="upload">
        <Uploaded onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
}

function Inks({ value, onChange }: { value: Ink; onChange: (ink: Ink) => void }) {
  const t = useTranslations("tools.sign");
  return (
    <div role="radiogroup" aria-label={t("ink")} className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("ink")}</span>
      {(Object.keys(INKS) as Ink[]).map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={t(`inks.${key}`)}
          onClick={() => onChange(key)}
          className={cn("size-7 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", value === key && "ring-2 ring-primary")}
          style={{ backgroundColor: INKS[key] }}
        />
      ))}
    </div>
  );
}

/** A pad to sign on. Each stroke is smoothed, and the signature is updated when a stroke ends. */
function DrawPad({ ink, onChange }: { ink: string; onChange: (signature: Signature | null) => void }) {
  const t = useTranslations("tools.sign");
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * e.currentTarget.width, y: ((e.clientY - box.top) / box.height) * e.currentTarget.height };
  };
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
    const context = canvas.current!.getContext("2d")!;
    context.strokeStyle = ink;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 5 * (pressure > 0 && pressure !== 0.5 ? 0.6 + pressure : 1);
    context.beginPath();
    context.moveTo(from.x, from.y);
    // Through the midpoint, so quick strokes stay curves rather than straight pieces.
    context.quadraticCurveTo(from.x, from.y, (from.x + to.x) / 2, (from.y + to.y) / 2);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        width={1200}
        height={400}
        aria-label={t("padLabel")}
        role="img"
        className="block aspect-[3/1] w-full touch-none rounded-lg border border-dashed bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          last.current = at(e);
          stroke(last.current, last.current, e.pressure);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const point = at(e);
          stroke(last.current, point, e.pressure);
          last.current = point;
        }}
        onPointerUp={() => {
          last.current = null;
          setEmpty(false);
          void asSignature(canvas.current).then(onChange);
        }}
      />
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("padHint")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={empty}
          onClick={() => {
            const el = canvas.current!;
            el.getContext("2d")!.clearRect(0, 0, el.width, el.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          <Eraser />
          {t("clear")}
        </Button>
      </div>
    </div>
  );
}

/** A name typed, written in a handwriting font. */
function Typed({ ink, onChange }: { ink: string; onChange: (signature: Signature | null) => void }) {
  const t = useTranslations("tools.sign");
  const id = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const text = name.trim();
      if (!text) {
        onChange(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 320;
      const context = canvas.getContext("2d")!;
      context.font = `120px ${SCRIPT}`;
      context.fillStyle = ink;
      context.textBaseline = "middle";
      context.fillText(text, 40, 170, 1520);
      void asSignature(canvas).then((signature) => live && onChange(signature));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, ink, onChange]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("name")}</Label>
      <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
      <div className="flex aspect-[5/1] items-center justify-center overflow-hidden rounded-lg border border-dashed bg-white px-4" aria-hidden>
        <span className="truncate text-4xl" style={{ fontFamily: SCRIPT, color: ink }}>
          {name}
        </span>
      </div>
    </div>
  );
}

/** A photo or scan of a signature on paper. Its white paper can be made see-through. */
function Uploaded({ onChange }: { onChange: (signature: Signature | null) => void }) {
  const t = useTranslations("tools.sign");
  const id = useId();
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [clearPaper, setClearPaper] = useState(true);
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    if (!image) return;
    let live = true;
    // At most 1600 pixels across: plenty for a signature, and quick to work on.
    const scale = Math.min(1, 1600 / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (clearPaper) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        // Paper is light: the lighter a pixel, the more it shows through, fully above 85%.
        const light = Math.min(d[i], d[i + 1], d[i + 2]) / 255;
        d[i + 3] = Math.round(d[i + 3] * Math.max(0, Math.min(1, (0.85 - light) / 0.25)));
      }
      context.putImageData(pixels, 0, 0);
    }
    void asSignature(canvas).then((signature) => live && onChange(signature));
    return () => {
      live = false;
    };
  }, [image, clearPaper, onChange]);

  return (
    <div className="space-y-3">
      <FileDrop
        accept="image/png,image/jpeg,image/webp"
        title={t("dropImage")}
        button={t("chooseImage")}
        hint={t("imageHint")}
        icon={ImageUp}
        compact
        onFiles={async ([file]) => {
          if (!file) return;
          try {
            setImage(await createImageBitmap(file));
            setProblem(false);
          } catch {
            setProblem(true);
          }
        }}
      />
      {problem && <p className="text-sm text-destructive">{t("notImage")}</p>}
      <div className="flex items-center gap-3">
        <Switch id={id} checked={clearPaper} onCheckedChange={setClearPaper} />
        <Label htmlFor={id} className="text-sm font-normal">
          {t("clearPaper")}
        </Label>
      </div>
    </div>
  );
}
