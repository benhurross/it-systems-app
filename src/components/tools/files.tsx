"use client";

import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { loadPdf, PdfToolError } from "@/lib/pdf-tools";
import type { ToolKey } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** Files larger than this are refused: the browser has to hold them, and the result, in memory. */
export const MAX_TOOL_FILE = 100 * 1024 * 1024;

/** Choose files with the button, or drop them on the area. */
export function FileDrop({ accept, multiple, label, hint, onFiles }: { accept: string; multiple?: boolean; label: string; hint: string; onFiles: (files: File[]) => void }) {
  const id = useId();
  const [over, setOver] = useState(false);
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
      className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors", over && "border-primary bg-brand-soft")}
    >
      <FileUp className="size-8 text-muted-foreground" aria-hidden />
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
      <label htmlFor={id} className={cn(buttonVariants(), "cursor-pointer peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50")}>
        {label}
      </label>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
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
  const [problems, setProblems] = useState<string[]>([]);
  const choose = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const bytes = await readFile(file);
      const loaded = await loadPdf(bytes);
      setPdf({ id: nextId.current++, name: file.name, size: file.size, bytes, pages: loaded.getPageCount() });
      setProblems([]);
    } catch (error) {
      setProblems([problem(file.name, error)]);
    }
  };
  return {
    pdf,
    problems,
    choose,
    clear: () => {
      setPdf(null);
      setProblems([]);
    },
  };
}
