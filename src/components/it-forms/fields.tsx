"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The pieces the IT forms are filled in with, bound to the form by the field's path under `data`
 * (person.name, incident.severity…). They follow the paper form's wording, so each reads as there.
 */

export function FormSection({ title, toggle, children }: { title: string; toggle?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
        <h3 className="text-sm font-semibold">{title}</h3>
        {toggle && <Tick path={toggle} label={title} srOnly invert />}
      </div>
      {children}
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="rounded bg-muted px-2 py-1 text-sm font-medium">{children}</h4>;
}

/** A line to write on: a text input with its label. */
export function Line({ path, label, wide, area, type, dir }: { path: string; label: string; wide?: boolean; area?: boolean; type?: "date" | "email" | "tel" | "url"; dir?: "ltr" }) {
  const id = useId();
  const { register } = useFormContext();
  return (
    <div className={cn("space-y-1", wide && "sm:col-span-2 lg:col-span-3")}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {area ? <Textarea id={id} rows={2} {...register(`data.${path}`)} /> : <Input id={id} type={type ?? "text"} dir={dir} {...register(`data.${path}`)} />}
    </div>
  );
}

/** A box to tick, for a yes/no field. */
export function Tick({ path, label, srOnly, invert }: { path: string; label: string; srOnly?: boolean; invert?: boolean }) {
  const id = useId();
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={`data.${path}`}
      render={({ field }) => (
        <span className="inline-flex items-center gap-2">
          <Checkbox id={id} checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} className={cn(invert && "border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary")} />
          <Label htmlFor={id} className={cn("text-sm font-normal", srOnly && "sr-only")}>
            {label}
          </Label>
        </span>
      )}
    />
  );
}

/** Boxes to tick for a list field: each ticked value is in the list. */
export function Ticks<V extends string>({ path, options, legend, columns = 4 }: { path: string; options: { value: V; label: string }[]; legend?: string; columns?: number }) {
  const { control } = useFormContext();
  const base = useId();
  return (
    <Controller
      control={control}
      name={`data.${path}`}
      render={({ field }) => {
        const chosen = (field.value as V[] | undefined) ?? [];
        return (
          <fieldset className="space-y-1.5">
            {legend && <legend className="text-xs font-medium text-muted-foreground">{legend}</legend>}
            <div className={cn("grid gap-x-4 gap-y-1.5", columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
              {options.map((o) => (
                <span key={o.value} className="inline-flex items-center gap-2">
                  <Checkbox
                    id={`${base}-${o.value}`}
                    checked={chosen.includes(o.value)}
                    onCheckedChange={(v) => field.onChange(v === true ? [...chosen, o.value] : chosen.filter((c) => c !== o.value))}
                  />
                  <Label htmlFor={`${base}-${o.value}`} className="text-sm font-normal">
                    {o.label}
                  </Label>
                </span>
              ))}
            </div>
          </fieldset>
        );
      }}
    />
  );
}

/** One choice of several (Low / Medium / High), or none. */
export function Choice<V extends string>({ path, options, legend }: { path: string; options: { value: V; label: string }[]; legend: string }) {
  const t = useTranslations("itForms");
  const { control } = useFormContext();
  const base = useId();
  return (
    <Controller
      control={control}
      name={`data.${path}`}
      render={({ field }) => (
        <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <legend className="float-start me-3 text-sm font-medium">{legend}</legend>
          <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="flex flex-wrap gap-4" aria-label={legend}>
            {options.map((o) => (
              <span key={o.value} className="inline-flex items-center gap-2">
                <RadioGroupItem id={`${base}-${o.value}`} value={o.value} />
                <Label htmlFor={`${base}-${o.value}`} className="text-sm font-normal">
                  {o.label}
                </Label>
              </span>
            ))}
          </RadioGroup>
          {field.value && (
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => field.onChange("")}>
              {t("clear")}
            </button>
          )}
        </fieldset>
      )}
    />
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
