"use client";

import { ArrowDown, ArrowUp, CircleAlert, GripVertical, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moved, useDragOrder } from "./reorder";

/** Files in the order they will be used: dragged, or moved with the arrows, and removable. */
export function OrderedFiles<T extends { id: number; name: string }>({
  files,
  onChange,
  preview,
  detail,
  label,
}: {
  files: T[];
  onChange: (files: T[]) => void;
  preview: (file: T) => ReactNode;
  detail: (file: T) => ReactNode;
  label: string;
}) {
  const t = useTranslations("tools.files");
  const order = useDragOrder(files, onChange);
  return (
    <div className="space-y-2">
      <ol className="space-y-2" aria-label={label}>
        {files.map((file, i) => (
          <li
            key={file.id}
            {...order.handlers(i)}
            className={cn(
              "group flex flex-wrap items-center gap-3 rounded-xl border bg-background p-2.5 pe-3 transition-all",
              order.dragging === i && "opacity-50",
              order.over === i && order.dragging !== i && "border-primary ring-2 ring-primary/30",
            )}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground" aria-hidden />
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
            <div className="flex h-16 w-12 shrink-0 items-center justify-center">{preview(file)}</div>
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-medium break-all">{file.name}</p>
              <p className="text-sm text-muted-foreground">{detail(file)}</p>
            </div>
            <div className="flex shrink-0 gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label={t("moveUp", { name: file.name })} disabled={i === 0} onClick={() => onChange(moved(files, i, i - 1))}>
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t("moveDown", { name: file.name })} disabled={i === files.length - 1} onClick={() => onChange(moved(files, i, i + 1))}>
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("remove", { name: file.name })}
                onClick={() => onChange(files.filter((f) => f.id !== file.id))}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {files.length > 1 && <p className="text-xs text-muted-foreground">{t("dragHint")}</p>}
    </div>
  );
}

/** Files that could not be used, and why. */
export function FileProblems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>
        <ul className="list-disc space-y-1 ps-4">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
