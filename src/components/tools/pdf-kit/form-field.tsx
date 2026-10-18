"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormField, FormValue } from "@/lib/pdf-form";
import { cn } from "@/lib/utils";

/** No choice, in a list that must have a value for each item. */
const NONE = "__none__";

/** One of the form's fields, with the control that suits it. */
export function FormFieldControl({ field, value, onChange, onFocus, active }: { field: FormField; value: FormValue; onChange: (v: FormValue) => void; onFocus: () => void; active: boolean }) {
  const t = useTranslations("tools.fill");
  const id = useId();
  const label = (
    <>
      {field.label}
      {field.required && <span className="text-destructive"> *</span>}
      {field.required && <span className="sr-only"> ({t("required")})</span>}
    </>
  );
  const wrap = (control: ReactNode, note?: string) => (
    <div className={cn("space-y-2 rounded-lg border-s-2 border-transparent ps-3 transition-colors", active && "border-primary")} onFocus={onFocus}>
      {control}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
  const readOnly = field.readOnly ? t("readOnly") : undefined;

  switch (field.kind) {
    case "text":
      return wrap(
        <>
          <Label htmlFor={id}>{label}</Label>
          {field.multiline ? (
            <Textarea id={id} value={String(value ?? "")} disabled={field.readOnly} maxLength={field.maxLength ?? undefined} rows={3} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <Input id={id} value={String(value ?? "")} disabled={field.readOnly} maxLength={field.maxLength ?? undefined} onChange={(e) => onChange(e.target.value)} />
          )}
        </>,
        readOnly ?? (field.maxLength ? t("maxLength", { count: field.maxLength }) : undefined),
      );
    case "checkbox":
      return wrap(
        <div className="flex items-center gap-3">
          <Checkbox id={id} checked={value === true} disabled={field.readOnly} onCheckedChange={(on) => onChange(on === true)} />
          <Label htmlFor={id} className="font-normal">
            {label}
          </Label>
        </div>,
        readOnly,
      );
    case "radio":
      return wrap(
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{label}</legend>
          <RadioGroup value={typeof value === "string" ? value : ""} onValueChange={(v) => onChange(v)} disabled={field.readOnly} className="flex flex-wrap gap-x-5 gap-y-2">
            {field.options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value={option} />
                {option}
              </label>
            ))}
          </RadioGroup>
          {typeof value === "string" && value && !field.readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t("clear")}
            </Button>
          )}
        </fieldset>,
        readOnly,
      );
    case "dropdown":
      if (field.editable) {
        return wrap(
          <>
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} list={`${id}-options`} value={String(value ?? "")} disabled={field.readOnly} onChange={(e) => onChange(e.target.value)} />
            <datalist id={`${id}-options`}>
              {field.options.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </>,
          readOnly,
        );
      }
      return wrap(
        <>
          <Label htmlFor={id}>{label}</Label>
          <Select value={typeof value === "string" && value ? value : NONE} disabled={field.readOnly} onValueChange={(v) => v !== "" && onChange(v === NONE ? null : v)}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("noChoice")}</SelectItem>
              {field.options.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>,
        readOnly,
      );
    case "list": {
      const chosen = Array.isArray(value) ? value : [];
      return wrap(
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {field.options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={chosen.includes(option)}
                  disabled={field.readOnly}
                  onCheckedChange={(on) => onChange(on ? (field.multiple ? [...chosen, option] : [option]) : chosen.filter((c) => c !== option))}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>,
        readOnly ?? (field.multiple ? t("several") : t("oneOnly")),
      );
    }
    case "signature":
      return wrap(<p className="text-sm font-medium">{label}</p>, t("signatureField"));
    default:
      return null;
  }
}
