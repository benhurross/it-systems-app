"use client";

import { ChevronLeft, ChevronRight, FormInput, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useEffectEvent, useId, useState } from "react";
import { toast } from "sonner";
import { FileChip, Opening, ToolPanel } from "@/components/tools/controls";
import { FileProblems } from "@/components/tools/file-list";
import { baseName, downloadBytes, FileDrop, type OnePdf, recordUse, useFileProblem, useOnePdf, useSizeLimit } from "@/components/tools/files";
import { PdfPage, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/hooks/use-format";
import { type FormField, FormLockError, type FormValue, type FormValues, fillForm, type ReadForm, readForm } from "@/lib/pdf-form";
import { cn } from "@/lib/utils";

/** No choice, in a list that must have a value for each item. */
const NONE = "__none__";

/** Filling in a PDF form: its fields beside the page, the answers shown on it as they are typed. */
export function FillPanel() {
  const t = useTranslations("tools");
  const one = useOnePdf();
  const limit = useSizeLimit();
  if (one.pdf) return <FillFile key={one.pdf.id} pdf={one.pdf} onClear={one.clear} />;
  return (
    <ToolPanel icon={FormInput} title={t("names.pdf_fill")} description={t("fill.hint")}>
      <FileDrop accept="application/pdf,.pdf" title={t("files.dropFile")} button={t("files.chooseOne")} hint={t("files.pdfOneLimit", { size: limit })} onFiles={one.choose} />
      <Opening name={one.opening} />
      <FileProblems problems={one.problems} />
    </ToolPanel>
  );
}

const initial = (fields: FormField[]): FormValues => Object.fromEntries(fields.filter((f) => "value" in f).map((f) => [f.name, (f as { value: FormValue }).value]));
const isEmpty = (v: FormValue | undefined) => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0);

function FillFile({ pdf, onClear }: { pdf: OnePdf; onClear: () => void }) {
  const t = useTranslations("tools");
  const format = useFormat();
  const problem = useFileProblem();
  const lockId = useId();
  const [form, setForm] = useState<ReadForm | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // Read once for each file; the message for a problem is worded when it happens.
  const cannotRead = useEffectEvent((error: unknown) => setProblems([problem(pdf.name, error)]));
  useEffect(() => {
    let live = true;
    readForm(pdf.bytes)
      .then((read) => {
        if (!live) return;
        setForm(read);
        setValues(initial(read.fields));
      })
      .catch((error) => live && cannotRead(error));
    return () => {
      live = false;
    };
  }, [pdf]);

  // The page as filled in so far, made again shortly after each change.
  const [filled, setFilled] = useState<Uint8Array | null>(null);
  useEffect(() => {
    if (!form || form.problem) return;
    let live = true;
    const timer = setTimeout(() => {
      fillForm(pdf.bytes, values)
        .then((bytes) => live && setFilled(bytes))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [form, values, pdf.bytes]);
  const doc = usePdfDocument(filled ?? pdf.bytes);

  const fillable = form?.fields.filter((f) => f.kind !== "button") ?? [];
  const missing = fillable.filter((f) => f.required && !f.readOnly && isEmpty(values[f.name]));
  const focused = fillable.find((f) => f.name === focus);
  const show = (field: FormField) => {
    setFocus(field.name);
    if (field.spots[0]) setPage(field.spots[0].page + 1);
  };
  const set = (name: string, value: FormValue) => setValues((v) => ({ ...v, [name]: value }));

  const run = async () => {
    setBusy(true);
    try {
      downloadBytes(`${baseName(pdf.name)}-filled.pdf`, await fillForm(pdf.bytes, values, { lock }));
      recordUse("pdf_fill");
      toast.success(t("files.ready"));
      setProblems([]);
    } catch (error) {
      setProblems([error instanceof FormLockError ? t("fill.lockNeedsLatin") : problem(pdf.name, error)]);
    } finally {
      setBusy(false);
    }
  };

  const ready = form !== null && form.problem === null;
  return (
    <ToolPanel
      icon={FormInput}
      title={t("names.pdf_fill")}
      description={t("fill.hint")}
      footer={
        ready ? (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-3">
                <Switch id={lockId} checked={lock} onCheckedChange={setLock} />
                <Label htmlFor={lockId} className="text-sm font-normal">
                  <Lock className="size-4" aria-hidden />
                  {t("fill.lock")}
                </Label>
              </div>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {missing.length > 0 ? t("fill.missing", { count: missing.length }) : t("fill.count", { count: fillable.length })}
              </span>
            </div>
            <Button size="lg" disabled={busy} onClick={run}>
              <FormInput />
              {busy ? t("files.working") : t("fill.action")}
            </Button>
          </>
        ) : undefined
      }
    >
      <FileChip name={pdf.name} size={pdf.size} pages={pdf.pages} onClear={onClear} />
      {!form && problems.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("fill.reading")}
        </p>
      )}
      {form?.problem && <p className="rounded-lg border bg-muted/40 p-4 text-sm">{t(form.problem === "xfa" ? "fill.xfa" : "fill.noFields")}</p>}
      {ready && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-5" aria-label={t("fill.fields")}>
            {lock && <p className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">{t("fill.lockHint")}</p>}
            {fillable.map((field, i) => {
              const pageNumber = field.spots[0] ? field.spots[0].page + 1 : null;
              const newPage = pageNumber !== null && pageNumber !== (fillable[i - 1]?.spots[0]?.page ?? -1) + 1;
              return (
                <div key={field.name} className="space-y-5">
                  {newPage && <h3 className="border-b pb-1 text-sm font-medium text-muted-foreground">{t("fill.page", { page: format.number(pageNumber) })}</h3>}
                  <Field field={field} value={values[field.name] ?? null} onChange={(v) => set(field.name, v)} onFocus={() => show(field)} active={field.name === focus} />
                </div>
              );
            })}
          </section>
          <section className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start" aria-label={t("fill.preview")}>
            <div className="flex items-center justify-center gap-1">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t("sign.previous")}>
                <ChevronLeft className="rtl:rotate-180" />
              </Button>
              <span className="min-w-28 text-center text-sm" aria-live="polite">
                {t("sign.pageOf", { page: format.number(page), pages: format.number(pdf.pages) })}
              </span>
              <Button variant="outline" size="icon" disabled={page >= pdf.pages} onClick={() => setPage(page + 1)} aria-label={t("sign.next")}>
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            </div>
            <PdfPage doc={doc} page={page} label={t("fill.pageLabel", { page: format.number(page) })}>
              {focused?.spots
                .filter((s) => s.page === page - 1)
                .map((s, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute rounded-sm bg-primary/15 ring-2 ring-primary"
                    style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }}
                  />
                ))}
            </PdfPage>
          </section>
        </div>
      )}
      <FileProblems problems={problems} />
    </ToolPanel>
  );
}

/** One of the form's fields, with the control that suits it. */
function Field({ field, value, onChange, onFocus, active }: { field: FormField; value: FormValue; onChange: (v: FormValue) => void; onFocus: () => void; active: boolean }) {
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
