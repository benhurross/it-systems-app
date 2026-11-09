"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Lookup } from "@/lib/api-types";
import { can } from "@/lib/permissions";

type QuickList = "processor" | "storage_type" | "operating_system" | "manufacturer";

/**
 * A dropdown of one of the lists in Settings → Lists, where a value not there yet can be typed and
 * added to the list on the spot, so it is offered from then on. Admins also get a link to edit it.
 */
export function ListField({ name, label, list, empty = "" }: { name: string; label: string; list: QuickList; empty?: "" | null }) {
  const t = useTranslations("assets.listField");
  const tc = useTranslations("common");
  const id = useId();
  const user = useCurrentUser();
  const lookups = useLookups();
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = lookups.options(list);
  const add = useApiMutation((text: string) => api<Lookup>("/lookups/quick", { body: { list, label: text } }), { success: t("added") });

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const selected = options.find((o) => o.value === field.value) ?? (field.value ? { value: field.value, label: lookups.label(list, field.value) } : null);
        const typed = search.trim();
        const exists = options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
        return (
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor={id}>
                {label}
                <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </FieldLabel>
              {can(user.role, "settings") && (
                <Link href={`/settings/lists?list=${list}`} className="text-xs text-primary hover:underline">
                  {t("edit")}
                </Link>
              )}
            </div>
            <Popover
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
                  <span className={selected ? "truncate" : "truncate text-muted-foreground"}>{selected?.label ?? tc("select")}</span>
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("searchOrAdd")} value={search} onValueChange={setSearch} />
                  <CommandList>
                    <CommandEmpty>{typed ? t("noneFound") : tc("none")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value={`__${tc("none")}`}
                        onSelect={() => {
                          field.onChange(empty);
                          setOpen(false);
                        }}
                      >
                        {tc("none")}
                      </CommandItem>
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
                    </CommandGroup>
                    {typed && !exists && (
                      <CommandGroup forceMount>
                        <CommandItem
                          forceMount
                          value={`__add ${typed}`}
                          disabled={add.isPending}
                          onSelect={() =>
                            add.mutate(typed, {
                              onSuccess: (row) => {
                                field.onChange(row.code);
                                setSearch("");
                                setOpen(false);
                              },
                            })
                          }
                        >
                          <Plus />
                          {t("add", { value: typed })}
                        </CommandItem>
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
        );
      }}
    />
  );
}
