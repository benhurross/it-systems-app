"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { z } from "zod";
import { NetworkHeader } from "@/components/network/network-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { DailyChecklist } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { DAILY_CHECKS } from "@/lib/domain";
import type { dailyCheckInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Save = (input: z.input<typeof dailyCheckInput>) => void;
type Item = DailyChecklist["items"][number];

export default function DailyChecksPage() {
  const t = useTranslations("daily");
  const format = useFormat();
  const today = isoDate();
  const [date, setDate] = useState(today);
  const { data } = useApi<DailyChecklist>(`/daily-checks?date=${date}`);
  // A tick and a note on the same item each carry both values, so saves run in order.
  const save = useApiMutation((input: z.input<typeof dailyCheckInput>) => api("/daily-checks", { method: "PUT", body: input }), {
    scope: "daily-checks",
  });
  const done = data?.items.filter((i) => i.done).length ?? 0;
  const total = DAILY_CHECKS.length;

  return (
    <>
      <NetworkHeader />
      <p className="mb-6 max-w-2xl text-muted-foreground">{t("intro")}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{format.date(date)}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("progress", { done: format.number(done), total: format.number(total) })}</p>
            </div>
            <Field className="w-auto">
              <FieldLabel htmlFor="check-day">{t("date")}</FieldLabel>
              <Input id="check-day" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </Field>
          </CardHeader>
          <CardContent>
            <Progress value={(done / total) * 100} className="mb-2" aria-label={t("progress", { done: String(done), total: String(total) })} />
            {!data ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <ul className="divide-y">
                {data.items.map((item) => (
                  <ChecklistRow key={`${date}-${item.item}`} date={date} item={item} onSave={save.mutate} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-0.5 text-sm">
              {data?.history.map((day) => (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => setDate(day.date)}
                    aria-current={day.date === date ? "date" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start hover:bg-muted",
                      day.date === date && "bg-brand-soft font-medium text-brand",
                    )}
                  >
                    <span>{format.date(day.date)}</span>
                    <span className={cn("tabular-nums", day.done < total && "text-warning")}>
                      {format.number(day.done)}/{format.number(total)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ChecklistRow({ date, item, onSave }: { date: string; item: Item; onSave: Save }) {
  const t = useTranslations();
  const format = useFormat();
  // Local copies, so the box ticks at once and a note saved straight after carries the new state.
  const [done, setDone] = useState(item.done);
  const [note, setNote] = useState(item.note ?? "");
  const id = `check-${item.item}`;
  const label = t(`enums.dailyCheck.${item.item}`);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Checkbox
          id={id}
          checked={done}
          onCheckedChange={(checked) => {
            setDone(checked === true);
            onSave({ date, item: item.item, done: checked === true, note });
          }}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <Label htmlFor={id} className="font-medium">
            {label}
          </Label>
          {done && item.checkedByName && item.checkedAt && (
            <p className="text-xs text-muted-foreground">{t("daily.by", { name: item.checkedByName, time: format.time(item.checkedAt) })}</p>
          )}
        </div>
      </div>
      <Input
        aria-label={t("daily.noteFor", { item: label })}
        placeholder={t("daily.notePlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (item.note ?? "") && onSave({ date, item: item.item, done, note })}
        className="h-8 w-full sm:w-64"
      />
    </li>
  );
}
