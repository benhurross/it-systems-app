"use client";

import { Hint } from "@/components/hint";
import { Copy, KeyRound, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DeleteRecord } from "@/components/delete-record";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { Json } from "@/lib/api-types";
import type * as tokens from "@/server/services/api-tokens";

type Token = Json<Awaited<ReturnType<typeof tokens.listApiTokens>>>[number];
type Made = Json<Awaited<ReturnType<typeof tokens.createApiToken>>>;

/** Keys for other systems, such as the Board's dashboard, to read the KPIs as they stand. */
export default function ApiAccessSettings() {
  const t = useTranslations("settings.api");
  const format = useFormat();
  const nameId = useId();
  const [name, setName] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const { data: list } = useApi<Token[]>("/settings/api-tokens");
  const create = useApiMutation((n: string) => api<Made>("/settings/api-tokens", { body: { name: n } }), {
    onSuccess: (m) => {
      setMade(m);
      setName("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const example = `curl -H "Authorization: Bearer ${made?.token ?? "apit_…"}" ${origin}/api/public/kpis?year=${new Date().getFullYear()}`;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {t("title")}
            <Hint>{t("intro")}</Hint>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <Field className="min-w-0 flex-1 basis-64">
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor={nameId}>{t("name")}</FieldLabel>
                <Hint>{t("nameHint")}</Hint>
              </div>
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={100} />
              <FieldDescription className="sr-only">{t("nameHint")}</FieldDescription>
            </Field>
            <Button type="submit" className="mb-7" disabled={!name.trim() || create.isPending}>
              <Plus />
              {t("create")}
            </Button>
          </form>
          {made && (
            <div role="status" className="space-y-2 rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">
              <p className="font-medium">{t("madeTitle", { name: made.name })}</p>
              <p>{t("madeHint")}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs" dir="ltr">
                  {made.token}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => copy(made.token)}>
                  <Copy />
                  {t("copy")}
                </Button>
              </div>
            </div>
          )}
          {!list ? (
            <Skeleton className="h-24 w-full" />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("key")}</TableHead>
                  <TableHead>{t("lastUsed")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                        {k.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">{t("made", { by: k.createdBy ?? "—", date: format.date(k.createdAt) })}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {k.prefix}…
                    </TableCell>
                    <TableCell>{k.revokedAt ? <StatusBadge tone="neutral">{t("revoked")}</StatusBadge> : k.lastUsedAt ? format.dateTime(k.lastUsedAt) : t("never")}</TableCell>
                    <TableCell className="text-end">
                      {!k.revokedAt && <RevokeKey id={k.id} name={k.name} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            {t("howTitle")}
            <Hint>{t("howIntro")}</Hint>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs" dir="ltr">
              {example}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(example)}>
              <Copy />
              {t("copy")}
            </Button>
          </div>
          <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
            <li>{t("howShares")}</li>
            <li>{t("howPeriods")}</li>
            <li>{t("howReadOnly")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/** Revoke, asked first, like Delete: the key stops working at once. */
function RevokeKey({ id, name }: { id: number; name: string }) {
  const t = useTranslations("settings.api");
  return (
    <DeleteRecord
      path={`/settings/api-tokens/${id}`}
      name={name}
      detail={t("revokeDetail")}
      labels={{ action: t("revoke"), confirm: t("confirmRevoke", { name }), done: t("revokedDone", { name }) }}
    />
  );
}
