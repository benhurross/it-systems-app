"use client";

import { FileText, Loader2, type LucideIcon, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "@/lib/files";
import { cn } from "@/lib/utils";

/**
 * A tool's working area: a card with its icon, title and hint above, the work in the middle,
 * and what it will make with the button to make it below.
 */
export function ToolPanel({
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card text-card-foreground shadow-glass glass-sheen ring-1 ring-foreground/10" aria-label={title}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="font-medium">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-5 p-4 sm:p-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/50 px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  );
}

/** A busy line while a chosen file opens. */
export function Opening({ name }: { name: string | null }) {
  const t = useTranslations("tools.files");
  if (!name) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {t("opening", { name })}
    </p>
  );
}

/** The PDF a one-file tool is working on, and a way to change it. */
export function FileChip({ name, size, pages, onClear, preview }: { name: string; size: number; pages: number; onClear: () => void; preview?: ReactNode }) {
  const t = useTranslations("tools.files");
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
      <span className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-soft text-brand">
        {preview ?? <FileText className="size-6" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-medium break-all">{name}</p>
        <p className="text-sm text-muted-foreground">
          {t("pages", { count: pages })} · {formatBytes(size, locale)}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        <RefreshCw />
        {t("change")}
      </Button>
    </div>
  );
}

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

/** One choice of a few, as cards with an icon and a line saying what each does. */
export function OptionCards<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; hint: string; icon: LucideIcon }[];
}) {
  const id = useId();
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">{legend}</FieldLegend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {options.map((o) => (
          <label
            key={o.value}
            htmlFor={`${id}-${o.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              value === o.value ? "border-primary bg-brand-soft" : "hover:bg-muted",
            )}
          >
            <RadioGroupItem id={`${id}-${o.value}`} value={o.value} className="mt-0.5" />
            <o.icon className={cn("mt-0.5 size-5 shrink-0", value === o.value ? "text-brand" : "text-muted-foreground")} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

/** A setting turned on or off, with its icon and a line saying what it does. */
export function SwitchRow({ icon: Icon, label, hint, checked, onChange }: { icon: LucideIcon; label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} className="mt-0.5" />
    </div>
  );
}
