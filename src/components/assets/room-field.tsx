"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApi } from "@/hooks/use-api";

type Room = { room: string; planId: number | null; planName: string | null };

/**
 * The room or area a device is in, picked from the rooms the floor plans name (which also puts it
 * on that plan), or typed when it is on none ("Store room"). Sets two fields: the room and its plan.
 */
export function RoomField({ roomName, planName, label }: { roomName: string; planName: string; label: string }) {
  const t = useTranslations("assets");
  const tc = useTranslations("common");
  const id = useId();
  const { control, setValue } = useFormContext();
  const [room, planId] = useWatch({ control, name: [roomName, planName] }) as [string | null | undefined, number | null | undefined];
  const { data: rooms = [] } = useApi<Room[]>("/rooms");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const typed = search.trim().replace(/\s+/g, " ");
  const exists = rooms.some((r) => r.room.toLowerCase() === typed.toLowerCase());
  const plans = [...new Set(rooms.map((r) => r.planName))];
  const set = (r: Room | null) => {
    setValue(roomName, r?.room ?? "", { shouldDirty: true });
    setValue(planName, r?.planId ?? null, { shouldDirty: true });
    setSearch("");
    setOpen(false);
  };
  const chosen = rooms.find((r) => r.room === room && r.planId === (planId ?? null));

  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        <span className="font-normal text-muted-foreground">{tc("optional")}</span>
      </FieldLabel>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className={room ? "truncate" : "truncate text-muted-foreground"}>
              {room ? (chosen?.planName ? `${room} · ${chosen.planName}` : room) : tc("select")}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={t("roomSearch")} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{rooms.length ? tc("none") : t("roomNone")}</CommandEmpty>
              <CommandGroup>
                <CommandItem value={`__${tc("none")}`} onSelect={() => set(null)}>
                  {tc("none")}
                </CommandItem>
              </CommandGroup>
              {plans.map((plan) => (
                <CommandGroup key={plan ?? ""} heading={plan ?? t("roomOther")}>
                  {rooms
                    .filter((r) => r.planName === plan)
                    .map((r) => (
                      <CommandItem key={`${r.planId}-${r.room}`} value={`${r.room} ${plan ?? ""} ${r.planId ?? ""}`} onSelect={() => set(r)}>
                        <Check className={chosen === r ? "opacity-100" : "opacity-0"} />
                        {r.room}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
              {typed && !exists && (
                <CommandGroup forceMount>
                  <CommandItem forceMount value={`__use ${typed}`} onSelect={() => set({ room: typed.slice(0, 120), planId: null, planName: null })}>
                    <Plus />
                    {t("roomUse", { value: typed })}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
