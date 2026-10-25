"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import type { Json } from "@/lib/api-types";
import type * as sheet from "@/server/services/kpi-sheet";

type Result = Json<Awaited<ReturnType<typeof sheet.importKpiRegister>>>;
const TONE: Record<Result["rows"][number]["action"], Tone> = { add: "success", update: "info", skip: "danger" };
const ERRORS = ["fileType", "fileSize", "fileEmpty"] as const;

async function send(file: File, apply: boolean): Promise<Result> {
  const form = new FormData();
  form.set("file", file);
  if (apply) form.set("apply", "1");
  const res = await fetch("/api/kpis/import", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "");
  return data as Result;
}

/** Loads the register from Excel: checked first, showing what each row will do, then loaded. */
export function ImportDialog({ onClose, onLoaded }: { onClose: () => void; onLoaded: (year: number) => void }) {
  const t = useTranslations("kpis.import");
  const format = useFormat();
  const queries = useQueryClient();
  const fileId = useId();
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(t(`errors.${(ERRORS as readonly string[]).includes(e.message) ? e.message : "generic"}` as "errors.generic"));
  const check = useMutation({ mutationFn: (f: File) => send(f, false), onSuccess: setResult, onError: fail });
  const load = useMutation({
    mutationFn: () => send(file!, true),
    onSuccess: async (loaded) => {
      toast.success(t("loaded", { added: format.number(loaded.counts.add), updated: format.number(loaded.counts.update), year: loaded.year }));
      await queries.invalidateQueries();
      onLoaded(loaded.year);
      onClose();
    },
    onError: fail,
  });
  const toLoad = result ? result.counts.add + result.counts.update : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
          <Field>
            <FieldLabel htmlFor={fileId}>{t("file")}</FieldLabel>
            <Input
              id={fileId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-describedby={hintId}
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                setResult(null);
                setError(null);
                if (chosen) check.mutate(chosen);
              }}
            />
            <FieldDescription id={hintId}>{t("hint")}</FieldDescription>
          </Field>
          {check.isPending && <p className="text-sm text-muted-foreground">{t("checking")}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result?.problem && (
            <p role="alert" className="text-sm text-destructive">
              {t("noHeader")}
            </p>
          )}
          {result && !result.problem && (
            <>
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                <span className="text-sm font-medium">{t("forYear", { year: result.year })}</span>
                {(["add", "update", "skip"] as const).map((a) => (
                  <StatusBadge key={a} tone={TONE[a]}>
                    {t(`counts.${a}`, { count: result.counts[a] })}
                  </StatusBadge>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("row")}</TableHead>
                    <TableHead>{t("kpi")}</TableHead>
                    <TableHead>{t("result")}</TableHead>
                    <TableHead>{t("details")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="tabular-nums">{format.number(r.line)}</TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                          {r.code || "—"}
                        </span>{" "}
                        <span dir="auto">{r.name}</span>
                        {r.role && <span className="block text-xs text-muted-foreground">{r.role}</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={TONE[r.action]}>{t(`actions.${r.action}`)}</StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-normal text-sm">
                        {r.problems.length ? (
                          <span className="text-destructive">{r.problems.map((p) => t(`problems.${p}` as "problems.noCode")).join(" ")}</span>
                        ) : r.months.length ? (
                          t("months", { count: r.months.length })
                        ) : (
                          <span className="text-muted-foreground">{t("noFigures")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!result || toLoad === 0 || load.isPending} onClick={() => load.mutate()}>
            <Upload />
            {load.isPending ? t("loading") : t("load", { count: toLoad })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
