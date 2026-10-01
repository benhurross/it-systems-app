"use client";

import { FileUp, type LucideIcon, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { loadPdf, PdfToolError } from "@/lib/pdf-tools";
import type { ToolKey } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** Files larger than this are refused: the browser has to hold them, and the result, in memory. */
export const MAX_TOOL_FILE = 100 * 1024 * 1024;

/**
 * Choose files with the button, or drop them on the area. The full size is a tool's starting
 * point; the compact one sits under a list, for adding more.
 */
export function FileDrop({
  accept,
  multiple,
  title,
  button,
  hint,
  icon: Icon = FileUp,
  compact,
  onFiles,
}: {
  accept: string;
  multiple?: boolean;
  title: string;
  button: string;
  hint: string;
  icon?: LucideIcon;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const t = useTranslations("tools.files");
  const id = useId();
  const [over, setOver] = useState(false);
  const input = (
    <input
      id={id}
      type="file"
      accept={accept}
      multiple={multiple}
      className="peer sr-only"
      onChange={(e) => {
        onFiles([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        "rounded-xl border-2 border-dashed transition-colors",
        compact ? "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" : "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        over ? "border-primary bg-brand-soft" : "border-border bg-muted/30 hover:border-primary/40",
      )}
    >
      {compact ? (
        <>
          {input}
          <label htmlFor={id} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50")}>
            <Plus />
            {button}
          </label>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </>
      ) : (
        <>
          <span className={cn("flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand transition-transform", over && "scale-110")}>
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{t("or")}</p>
          </div>
          {input}
          <label htmlFor={id} className={cn(buttonVariants({ size: "lg" }), "cursor-pointer px-4 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50")}>
            {button}
          </label>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </>
      )}
    </div>
  );
}

/**
 * Files dropped outside a drop area would otherwise open in the browser, leaving the tool and
 * losing the work on it.
 */
export function useNoStrayDrops() {
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
}

/** "up to 100 MB", in the reader's numbers. */
export function useSizeLimit() {
  const format = useFormat();
  return `${format.number(MAX_TOOL_FILE / 1024 / 1024)} MB`;
}

/** Saves bytes as a file in the person's downloads. */
export function downloadBytes(name: string, bytes: Uint8Array, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Counts a use for Settings. Never the file, and a failure here never stops the person. */
export function recordUse(tool: ToolKey) {
  void fetch(`/api/tools/${tool}/use`, { method: "POST" }).catch(() => {});
}

/** A file's name without its extension, for naming what is made from it. */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || "document";

/** Why a file cannot be used, in the reader's language. */
export function useFileProblem() {
  const t = useTranslations("tools.files.errors");
  const format = useFormat();
  return (name: string, error: unknown) => {
    if (error instanceof PdfToolError) return t(error.problem, { name });
    if (error instanceof Error && error.message === "tooBig") return t("tooBig", { name, size: `${format.number(MAX_TOOL_FILE / 1024 / 1024)} MB` });
    if (error instanceof Error && error.message === "notImage") return t("notImage", { name });
    return t("failed");
  };
}

export async function readFile(file: File) {
  if (file.size > MAX_TOOL_FILE) throw new Error("tooBig");
  return new Uint8Array(await file.arrayBuffer());
}

export type OnePdf = { id: number; name: string; size: number; bytes: Uint8Array; pages: number };

/** The single PDF a tool works on. A new one gets a new id, so the tool can start afresh. */
export function useOnePdf() {
  const problem = useFileProblem();
  const nextId = useRef(1);
  const [pdf, setPdf] = useState<OnePdf | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const choose = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setOpening(file.name);
    try {
      const bytes = await readFile(file);
      const loaded = await loadPdf(bytes);
      setPdf({ id: nextId.current++, name: file.name, size: file.size, bytes, pages: loaded.getPageCount() });
      setProblems([]);
    } catch (error) {
      setProblems([problem(file.name, error)]);
    } finally {
      setOpening(null);
    }
  };
  return {
    pdf,
    opening,
    problems,
    choose,
    clear: () => {
      setPdf(null);
      setProblems([]);
    },
  };
}
