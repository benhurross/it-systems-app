"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { columnHelper, DataTable } from "@/components/data-table";
import { FormDialog, NumberField, SwitchField, TextField } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { Lookup } from "@/lib/api-types";
import { LOOKUP_LISTS, type LookupList } from "@/lib/domain";
import { lookupInput } from "@/lib/schemas";

const col = columnHelper<Lookup>();
type Input = z.output<typeof lookupInput>;

export default function ListsPage() {
  const t = useTranslations("settings.lists");
  const [list, setList] = useState<LookupList>("location");
  const [editing, setEditing] = useState<Lookup | "new" | null>(null);
  const { data = [], isLoading } = useApi<Lookup[]>("/settings/lists");
  const rows = data.filter((l) => l.list === list);

  const columns = [
    col.accessor("code", { header: t("code"), cell: (info) => <code className="text-xs">{info.getValue()}</code> }),
    col.accessor("labelEn", { header: t("english"), cell: (info) => <span lang="en">{info.getValue()}</span> }),
    col.accessor("labelAr", { header: t("arabic"), cell: (info) => <span lang="ar">{info.getValue()}</span> }),
    col.accessor("sortOrder", { header: t("order") }),
    col.accessor("active", {
      header: t("active"),
      cell: (info) => (
        <StatusBadge tone={info.getValue() ? "success" : "neutral"}>{info.getValue() ? t("active") : t("inactive")}</StatusBadge>
      ),
    }),
    col.display({
      id: "edit",
      header: () => null,
      cell: (info) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(info.row.original)}>
          {t("edit")}
        </Button>
      ),
    }),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="list-picker">{t("list")}</Label>
        <Select value={list} onValueChange={(v) => setList(v as LookupList)}>
          <SelectTrigger id="list-picker" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKUP_LISTS.map((l) => (
              <SelectItem key={l} value={l}>
                {t(`names.${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        key={list}
        data={rows}
        columns={columns}
        loading={isLoading}
        pageSize={25}
        toolbar={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      {editing && (
        <LookupDialog
          list={list}
          lookup={editing === "new" ? null : editing}
          nextOrder={Math.max(0, ...rows.map((r) => r.sortOrder)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LookupDialog({
  list,
  lookup,
  nextOrder,
  onClose,
}: {
  list: LookupList;
  lookup: Lookup | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const t = useTranslations();
  const form = useForm<z.input<typeof lookupInput>, unknown, Input>({
    resolver: zodResolver(lookupInput),
    defaultValues: lookup ?? { list, code: "", labelEn: "", labelAr: "", sortOrder: nextOrder, active: true },
  });
  const save = useApiMutation(
    (values: Input) =>
      lookup
        ? api(`/settings/lists/${lookup.id}`, { method: "PATCH", body: values })
        : api("/settings/lists", { body: values }),
    { success: t("settings.saved"), form, onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={`${lookup ? t("settings.lists.edit") : t("settings.lists.add")}: ${t(`settings.lists.names.${list}`)}`}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
    >
      {lookup ? (
        <p className="text-sm">
          {t("settings.lists.code")}: <code>{lookup.code}</code>
        </p>
      ) : (
        <TextField name="code" label={t("settings.lists.code")} description={t("settings.lists.codeHint")} dir="ltr" />
      )}
      <TextField name="labelEn" label={t("settings.lists.english")} />
      <TextField name="labelAr" label={t("settings.lists.arabic")} />
      <NumberField name="sortOrder" label={t("settings.lists.order")} min={0} step={1} />
      <SwitchField name="active" label={t("settings.lists.active")} />
    </FormDialog>
  );
}
