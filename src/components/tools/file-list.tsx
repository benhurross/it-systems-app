"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Files in the order they will be used, each movable and removable. */
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
  const move = (i: number, by: number) => {
    const next = [...files];
    const [file] = next.splice(i, 1);
    next.splice(i + by, 0, file);
    onChange(next);
  };
  return (
    <ol className="divide-y rounded-lg border" aria-label={label}>
      {files.map((file, i) => (
        <li key={file.id} className="flex flex-wrap items-center gap-3 p-3">
          <span className="w-6 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
          <div className="flex h-16 w-12 shrink-0 items-center justify-center">{preview(file)}</div>
          <div className="min-w-0 flex-1 basis-40">
            <p className="font-medium break-all">{file.name}</p>
            <p className="text-sm text-muted-foreground">{detail(file)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={t("moveUp", { name: file.name })} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("moveDown", { name: file.name })} disabled={i === files.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("remove", { name: file.name })} onClick={() => onChange(files.filter((f) => f.id !== file.id))}>
              <Trash2 />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Files that could not be used, and why. */
export function FileProblems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
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
