"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ComboboxField, FormDialog, SelectField } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";
import { TOOL_ICONS } from "@/components/tools/tool-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { ToolsOverview, UserRow } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { toolException, toolSettings } from "@/lib/schemas";
import { PDF_MODES, TOOL_KEYS, TOOL_MODES } from "@/lib/tools";
import { SettingsCard } from "../settings-card";

type Settings = z.output<typeof toolSettings>;

export default function ToolsSettings() {
  const { data } = useApi<ToolsOverview>("/tools/admin");
  return (
    <div className="space-y-6">
      <ToolModes data={data} />
      <Requests data={data} />
      <People data={data} />
    </div>
  );
}

/** Departments to keep a tool from, chosen from a menu of ticks. */
function DepartmentPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const t = useTranslations("settings.toolsAccess");
  const lookups = useLookups();
  const id = useId();
  const names = value.map((code) => lookups.label("department", code));
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("blockedDepartments")}</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id={id} variant="outline" className="h-auto min-h-9 justify-between text-start font-normal whitespace-normal">
            <span className={names.length ? "" : "text-muted-foreground"}>{names.length ? names.join(", ") : t("noneBlocked")}</span>
            <ChevronDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64">
          {lookups.options("department").map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={value.includes(o.value)}
              onCheckedChange={(checked) => onChange(checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
              onSelect={(e) => e.preventDefault()}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

/** Each tool on for everyone, after approval, or off; and the departments it is kept from. */
function ToolModes({ data }: { data: ToolsOverview | undefined }) {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const form = useForm<z.input<typeof toolSettings>, unknown, Settings>({ resolver: zodResolver(toolSettings) });
  useEffect(() => {
    if (data) form.reset(Object.fromEntries(data.tools.map((tool) => [tool.key, { mode: tool.mode, blockedDepartments: tool.blockedDepartments }])));
  }, [data, form]);
  const save = useApiMutation((values: Settings) => api("/settings/tools", { method: "PUT", body: values }), {
    success: t("settings.toolsAccess.saved"),
    form,
  });
  const modes = TOOL_MODES.map((mode) => ({ value: mode, label: t(`settings.toolsAccess.modes.${mode}`) }));

  return (
    <SettingsCard
      title={t("settings.toolsAccess.title")}
      description={t("settings.toolsAccess.description")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      loading={!data || !lookups.ready}
      className="max-w-3xl"
    >
      {data?.tools.map((tool, i) => {
        const Icon = TOOL_ICONS[tool.key];
        return (
          <Fragment key={tool.key}>
            {i > 0 && <FieldSeparator />}
            <FieldSet>
              <FieldLegend className="flex flex-wrap items-center gap-2">
                <Icon className="size-4 text-brand" aria-hidden />
                {t(`tools.names.${tool.key}`)}
                {PDF_MODES.some((m) => m.tool === tool.key) && (
                  <Badge variant="secondary" className="font-normal">
                    {t("tools.cards.pdf_kit.name")}
                  </Badge>
                )}
              </FieldLegend>
              <FieldDescription>
                {t("settings.toolsAccess.uses", { recent: tool.recentUses, days: data.days, total: format.number(tool.totalUses) })}
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField name={`${tool.key}.mode`} label={t("settings.toolsAccess.mode")} options={modes} />
                <Controller
                  control={form.control}
                  name={`${tool.key}.blockedDepartments`}
                  render={({ field }) => <DepartmentPicker value={field.value ?? []} onChange={field.onChange} />}
                />
              </div>
            </FieldSet>
          </Fragment>
        );
      })}
    </SettingsCard>
  );
}

/** Requests waiting for an answer: granting allows that person; either answer resolves the ticket. */
function Requests({ data }: { data: ToolsOverview | undefined }) {
  const t = useTranslations();
  const format = useFormat();
  const decide = useApiMutation(
    ({ id, grant }: { id: number; grant: boolean }) => api<{ granted: boolean }>(`/tools/exceptions/${id}/decide`, { body: { grant } }),
    { onSuccess: ({ granted }) => toast.success(t(granted ? "settings.toolsAccess.granted" : "settings.toolsAccess.declined")) },
  );
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("settings.toolsAccess.requests")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-16 w-full" />
        ) : data.requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.toolsAccess.noRequests")}</p>
        ) : (
          <ul className="divide-y">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{r.userName}</p>
                  <p className="text-sm break-all text-muted-foreground">{r.userEmail}</p>
                  <p className="text-sm">
                    {t(`tools.names.${r.tool}`)} · {format.date(r.updatedAt)}
                    {r.ticketId && (
                      <>
                        {" · "}
                        <Link href={`/tickets/${r.ticketId}`} className="text-primary hover:underline">
                          {ref("ticket", r.ticketId)}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, grant: true })}>
                    {t("settings.toolsAccess.grant")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, grant: false })}>
                    {t("settings.toolsAccess.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** People allowed or blocked whatever a tool's setting, and adding another. */
function People({ data }: { data: ToolsOverview | undefined }) {
  const t = useTranslations();
  const [adding, setAdding] = useState(false);
  const remove = useApiMutation((id: number) => api(`/tools/exceptions/${id}`, { method: "DELETE" }), { success: t("settings.toolsAccess.removed") });
  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>{t("settings.toolsAccess.people")}</CardTitle>
          <CardDescription>{t("settings.toolsAccess.peopleHint")}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus />
          {t("settings.toolsAccess.add")}
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-16 w-full" />
        ) : data.exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.toolsAccess.noPeople")}</p>
        ) : (
          <ul className="divide-y">
            {data.exceptions.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{e.userName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(`tools.names.${e.tool}`)}
                    {e.decidedBy && ` · ${t("settings.toolsAccess.by", { name: e.decidedBy })}`}
                  </p>
                </div>
                <StatusBadge tone={e.state === "allowed" ? "success" : "danger"}>{t(`settings.toolsAccess.states.${e.state}`)}</StatusBadge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("settings.toolsAccess.remove", { name: e.userName })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(e.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {adding && <AddException onClose={() => setAdding(false)} />}
    </Card>
  );
}

function AddException({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const { data: users = [] } = useApi<UserRow[]>("/settings/users");
  const form = useForm<z.input<typeof toolException>, unknown, z.output<typeof toolException>>({
    resolver: zodResolver(toolException),
    defaultValues: { userId: "", tool: TOOL_KEYS[0], state: "allowed" },
  });
  const save = useApiMutation((values: z.output<typeof toolException>) => api("/tools/exceptions", { body: values }), {
    form,
    success: t("settings.toolsAccess.exceptionSaved"),
    onSuccess: onClose,
  });
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("settings.toolsAccess.add")}
      description={t("settings.toolsAccess.peopleHint")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
    >
      <ComboboxField
        name="userId"
        label={t("settings.toolsAccess.person")}
        options={users.filter((u) => !u.banned).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
      />
      <SelectField name="tool" label={t("settings.toolsAccess.tool")} options={TOOL_KEYS.map((key) => ({ value: key, label: t(`tools.names.${key}`) }))} />
      <SelectField
        name="state"
        label={t("settings.toolsAccess.access")}
        options={[
          { value: "allowed", label: t("settings.toolsAccess.allow") },
          { value: "blocked", label: t("settings.toolsAccess.block") },
        ]}
      />
    </FormDialog>
  );
}
