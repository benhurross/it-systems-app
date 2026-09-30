"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import {
  Controller,
  FormProvider,
  get,
  useFormContext,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type messages from "../../messages/en.json";

type ValidationKey = keyof (typeof messages)["validation"];
const NONE = "__none";

export type Option = { value: string | number; label: string };

/** A form bound to react-hook-form. `TOut` is what the resolver hands to `onSubmit` after parsing. */
export function Form<TIn extends FieldValues, TOut extends FieldValues = TIn>({
  form,
  onSubmit,
  id,
  className,
  children,
}: {
  form: UseFormReturn<TIn, unknown, TOut>;
  onSubmit: SubmitHandler<TOut>;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <form id={id} onSubmit={form.handleSubmit(onSubmit)} className={className} noValidate>
        {children}
      </form>
    </FormProvider>
  );
}

type FieldProps = { name: string; label: string; description?: string; optional?: boolean };

/** Label, control, hint and error for one field. Schema messages named `validation.*` are translated. */
function Shell({
  name,
  label,
  description,
  optional,
  horizontal,
  children,
}: FieldProps & { horizontal?: boolean; children: (id: string, invalid: boolean) => ReactNode }) {
  const t = useTranslations();
  const tv = useTranslations("validation");
  const { formState } = useFormContext();
  const id = useId();
  const message = get(formState.errors, name)?.message as string | undefined;
  const text = message?.startsWith("validation.") ? tv(message.slice(11) as ValidationKey) : message;

  return (
    <Field data-invalid={!!message} orientation={horizontal ? "horizontal" : undefined}>
      {horizontal && children(id, !!message)}
      <FieldLabel htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">{t("common.optional")}</span>}
      </FieldLabel>
      {!horizontal && children(id, !!message)}
      {description && <FieldDescription>{description}</FieldDescription>}
      {text && <FieldError>{text}</FieldError>}
    </Field>
  );
}

// Empty inputs become null for optional fields; a required field keeps "" so the schema reports it.
const emptyTo = (optional?: boolean) => (optional ? null : "");

export function TextField({
  type = "text",
  dir,
  autoComplete,
  ...props
}: FieldProps & { type?: "text" | "email" | "password" | "url"; dir?: "ltr"; autoComplete?: string }) {
  const { register } = useFormContext();
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Input
          id={id}
          type={type}
          dir={dir}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          {...register(props.name, { setValueAs: (v) => (v === "" ? emptyTo(props.optional) : v) })}
        />
      )}
    </Shell>
  );
}

export function NumberField({ step, min, ...props }: FieldProps & { step?: number; min?: number }) {
  const { register } = useFormContext();
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          dir="ltr"
          aria-invalid={invalid}
          {...register(props.name, {
            setValueAs: (v) => (v === "" || v === null ? (props.optional ? null : undefined) : Number(v)),
          })}
        />
      )}
    </Shell>
  );
}

export function DateField(props: FieldProps) {
  const { register } = useFormContext();
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Input
          id={id}
          type="date"
          aria-invalid={invalid}
          {...register(props.name, { setValueAs: (v) => (v === "" ? emptyTo(props.optional) : v) })}
        />
      )}
    </Shell>
  );
}

/** A local date and time from the browser, sent to the server as an instant. */
export function DateTimeField(props: FieldProps) {
  const { control } = useFormContext();
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Controller
          control={control}
          name={props.name}
          render={({ field }) => (
            <Input
              id={id}
              type="datetime-local"
              aria-invalid={invalid}
              value={field.value ? toLocalInput(field.value) : ""}
              onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
              onBlur={field.onBlur}
            />
          )}
        />
      )}
    </Shell>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TextareaField({ rows = 4, ...props }: FieldProps & { rows?: number }) {
  const { register } = useFormContext();
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Textarea
          id={id}
          rows={rows}
          aria-invalid={invalid}
          {...register(props.name, { setValueAs: (v) => (v === "" ? emptyTo(props.optional) : v) })}
        />
      )}
    </Shell>
  );
}

export function SelectField({ options, ...props }: FieldProps & { options: Option[] }) {
  const t = useTranslations("common");
  const { control } = useFormContext();
  const numeric = typeof options[0]?.value === "number";
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Controller
          control={control}
          name={props.name}
          render={({ field }) => (
            <Select
              value={field.value == null || field.value === "" ? (props.optional ? NONE : "") : String(field.value)}
              // Radix reports "" when a value arrives before its hidden <select> has the options (a form
              // filled in after loading); no real choice is "", so it would only wipe the loaded value.
              onValueChange={(v) => v !== "" && field.onChange(v === NONE ? null : numeric ? Number(v) : v)}
            >
              <SelectTrigger id={id} aria-invalid={invalid} className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {props.optional && <SelectItem value={NONE}>{t("none")}</SelectItem>}
                {options.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </Shell>
  );
}

/** A searchable picker for long lists such as employees or assets. */
export function ComboboxField({ options, placeholder, ...props }: FieldProps & { options: Option[]; placeholder?: string }) {
  const t = useTranslations("common");
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  return (
    <Shell {...props}>
      {(id, invalid) => (
        <Controller
          control={control}
          name={props.name}
          render={({ field }) => {
            const selected = options.find((o) => o.value === field.value);
            return (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-invalid={invalid}
                    className="w-full justify-between font-normal"
                  >
                    <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
                      {selected?.label ?? placeholder ?? t("select")}
                    </span>
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("search")} />
                    <CommandList>
                      <CommandEmpty>{t("none")}</CommandEmpty>
                      {props.optional && (
                        <CommandItem
                          value={`__${t("none")}`}
                          onSelect={() => {
                            field.onChange(null);
                            setOpen(false);
                          }}
                        >
                          {t("none")}
                        </CommandItem>
                      )}
                      {options.map((o) => (
                        <CommandItem
                          key={o.value}
                          value={`${o.label} ${o.value}`}
                          onSelect={() => {
                            field.onChange(o.value);
                            setOpen(false);
                          }}
                        >
                          <Check className={o.value === field.value ? "opacity-100" : "opacity-0"} />
                          {o.label}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            );
          }}
        />
      )}
    </Shell>
  );
}

export function SwitchField(props: FieldProps) {
  const { control } = useFormContext();
  return (
    <Shell {...props} horizontal>
      {(id) => (
        <Controller
          control={control}
          name={props.name}
          render={({ field }) => <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} />}
        />
      )}
    </Shell>
  );
}

/** A dialog holding one form, with Cancel and a submit button in the footer. */
export function FormDialog<TIn extends FieldValues, TOut extends FieldValues = TIn>({
  open,
  onOpenChange,
  title,
  description,
  form,
  onSubmit,
  submitLabel,
  pending,
  wide,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  form: UseFormReturn<TIn, unknown, TOut>;
  onSubmit: SubmitHandler<TOut>;
  submitLabel?: string;
  pending?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const id = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={wide ? "sm:max-w-2xl" : "sm:max-w-lg"}
        // Without a description, say so explicitly rather than leave Radix looking for one.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form form={form} onSubmit={onSubmit} id={id} className="-mx-1 max-h-[65vh] overflow-y-auto px-1 py-1">
          <FieldGroup>{children}</FieldGroup>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={id} disabled={pending}>
            {submitLabel ?? t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
