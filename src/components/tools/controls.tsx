"use client";

import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatBytes } from "@/lib/files";
import { cn } from "@/lib/utils";

/** One choice of a few, each shown with its label. */
export function Choices<T extends string>({
  legend,
  value,
  onChange,
  options,
  className,
}: {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  className?: string;
}) {
  const id = useId();
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">{legend}</FieldLegend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className={cn("flex flex-wrap gap-x-5 gap-y-2", className)}>
        {options.map((o) => (
          <label key={o.value} htmlFor={`${id}-${o.value}`} className="flex cursor-pointer items-center gap-2 text-sm">
            <RadioGroupItem id={`${id}-${o.value}`} value={o.value} />
            {o.label}
          </label>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

/** The PDF a one-file tool is working on, and a way to start again with another. */
export function ChosenPdf({ name, size, pages, onClear }: { name: string; size: number; pages: number; onClear: () => void }) {
  const t = useTranslations("tools.files");
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <FileText className="size-6 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium break-all">{name}</p>
        <p className="text-sm text-muted-foreground">
          {t("pages", { count: pages })} · {formatBytes(size, locale)}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        {t("another")}
      </Button>
    </div>
  );
}
