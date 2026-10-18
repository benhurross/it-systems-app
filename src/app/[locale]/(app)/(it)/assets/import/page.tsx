"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AssetsHeader } from "@/components/assets/assets-header";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { Json } from "@/lib/api-types";
import {
  type ImportField,
  type Problem,
  TEMPLATE_HEADERS,
} from "@/lib/asset-import";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ref } from "@/lib/domain";
import type * as assetImport from "@/server/services/asset-import";

type Result = Json<Awaited<ReturnType<typeof assetImport.importAssets>>>;
type Action = Result["rows"][number]["action"];

const TONE: Record<Action, Tone> = {
  add: "success",
  update: "info",
  unchanged: "neutral",
  skip: "danger",
};
const ERRORS = ["fileType", "fileSize", "fileEmpty", "tooManyRows"] as const;

/** A CSV file, or an .xlsx workbook (a zip file, starting "PK"). */
async function spreadsheet(file: File) {
  if (/\.csv$/i.test(file.name)) return true;
  const start = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return start[0] === 0x50 && start[1] === 0x4b;
}

async function send(file: File, apply: boolean): Promise<Result> {
  if (!(await spreadsheet(file))) throw new Error("fileType");
  const form = new FormData();
  form.set("file", file);
  if (apply) form.set("apply", "1");
  const res = await fetch("/api/assets/import", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error((data as { error?: string } | null)?.error ?? "");
  return data as Result;
}

export default function AssetImportPage() {
  const t = useTranslations();
  const format = useFormat();
  const fileId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: Error) =>
    setError(
      t(
        `assets.import.errors.${(ERRORS as readonly string[]).includes(e.message) ? e.message : "generic"}` as "assets.import.errors.generic",
      ),
    );
  const check = useMutation({
    mutationFn: (chosen: File) => send(chosen, false),
    onSuccess: setResult,
    onError: fail,
  });
  const load = useMutation({
    mutationFn: () => send(file!, true),
    onSuccess: (loaded) => {
      setResult(loaded);
      toast.success(
        t("assets.import.loaded", {
          added: format.number(loaded.counts.add),
          updated: format.number(loaded.counts.update),
        }),
      );
    },
    onError: fail,
  });

  const choose = (chosen: File | null) => {
    setFile(chosen);
    setResult(null);
    setError(null);
    if (chosen) check.mutate(chosen);
  };
  const reset = () => {
    choose(null);
    if (input.current) input.current.value = "";
  };

  const fieldName = (field: ImportField) =>
    field === "tag" ? t("assets.import.tag") : t(`assets.${field}`);
  const problem = (p: Problem) => {
    switch (p.code) {
      case "required":
        return t("assets.import.problems.required", {
          field: fieldName(p.field),
        });
      case "unknown":
      case "date":
      case "number":
        return t(`assets.import.problems.${p.code}`, {
          field: fieldName(p.field),
          value: p.value,
        });
      case "noTag":
      case "person":
      case "personAmbiguous":
        return t(`assets.import.problems.${p.code}`, { value: p.value });
      case "repeated":
        return t("assets.import.problems.repeated", {
          line: format.number(p.line),
        });
      case "invalid":
        return t("assets.import.problems.invalid", {
          field: fieldName(p.field),
          message: p.message.startsWith("validation.")
            ? t(p.message as "validation.required")
            : p.message,
        });
      default:
        return t("assets.import.problems.noHeader");
    }
  };
  const template = () =>
    downloadCsv(
      "assets-template.csv",
      toCsv(
        [],
        TEMPLATE_HEADERS.map((header) => ({ header, value: () => "" })),
      ),
    );

  const toLoad = result ? result.counts.add + result.counts.update : 0;
  const busy = check.isPending || load.isPending;

  return (
    <>
      <AssetsHeader />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("assets.import.title")}</CardTitle>
            <CardDescription>{t("assets.import.intro")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Button variant="outline" onClick={template}>
              <Download />
              {t("assets.import.template")}
            </Button>
            <Field>
              <FieldLabel htmlFor={fileId}>
                {t("assets.import.file")}
              </FieldLabel>
              <Input
                ref={input}
                id={fileId}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                aria-describedby={hintId}
                disabled={load.isPending}
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />
              <FieldDescription id={hintId}>
                {t("assets.import.fileHint")}
              </FieldDescription>
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2 text-sm text-muted-foreground">
              <h3 className="font-medium text-foreground">
                {t("assets.import.columnsTitle")}
              </h3>
              <p>{t("assets.import.columns")}</p>
              <ul className="list-disc space-y-1 ps-5">
                <li>{t("assets.import.columnTag")}</li>
                <li>{t("assets.import.columnPerson")}</li>
                <li>{t("assets.import.columnDates")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <FileSpreadsheet
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span dir="auto" className="min-w-0 break-words">
                  {result && file
                    ? t(
                        result.applied
                          ? "assets.import.loadedTitle"
                          : "assets.import.resultTitle",
                        { file: file.name },
                      )
                    : check.isPending
                      ? t("assets.import.checking")
                      : t("assets.import.title")}
                </span>
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <p className="text-sm text-muted-foreground">
                {check.isPending
                  ? t("assets.import.checking")
                  : t("assets.import.fileHint")}
              </p>
            ) : result.problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem(result.problem as Problem)}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2" aria-live="polite">
                  {(["add", "update", "unchanged", "skip"] as const).map(
                    (action) => (
                      <StatusBadge key={action} tone={TONE[action]}>
                        {t(`assets.import.counts.${action}`, {
                          count: result.counts[action],
                        })}
                      </StatusBadge>
                    ),
                  )}
                </div>
                {result.unused.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("assets.import.unused", {
                      columns: result.unused.join(", "),
                    })}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {result.applied ? (
                    <>
                      <Button asChild>
                        <Link href="/assets/inventory">
                          {t("assets.import.openInventory")}
                        </Link>
                      </Button>
                      <Button variant="outline" onClick={reset}>
                        {t("assets.import.another")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={busy || toLoad === 0}
                      onClick={() => load.mutate()}
                    >
                      <Upload />
                      {load.isPending
                        ? t("assets.import.loading")
                        : t("assets.import.load", { count: toLoad })}
                    </Button>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">
                        {t("assets.import.row")}
                      </TableHead>
                      <TableHead>{t("assets.import.name")}</TableHead>
                      <TableHead>{t("assets.import.result")}</TableHead>
                      <TableHead>{t("assets.import.details")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Problems first: they are what needs fixing in the file. */}
                    {[...result.rows]
                      .sort(
                        (a, b) =>
                          Number(b.action === "skip") -
                            Number(a.action === "skip") || a.line - b.line,
                      )
                      .map((row) => (
                        <TableRow key={row.line}>
                          <TableCell className="tabular-nums">
                            {format.number(row.line)}
                          </TableCell>
                          <TableCell>
                            {row.assetId && row.action !== "skip" ? (
                              <Link
                                href={`/assets/${row.assetId}`}
                                className="text-primary hover:underline"
                              >
                                <span dir="auto">{row.name}</span>{" "}
                                <span className="font-mono text-xs text-muted-foreground">
                                  {ref("asset", row.assetId)}
                                </span>
                              </Link>
                            ) : (
                              <span dir="auto">{row.name || "—"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={TONE[row.action]}>
                              {t(`assets.import.actions.${row.action}`)}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="whitespace-normal text-sm">
                            {row.problems.length > 0 ? (
                              <ul className="space-y-1 text-destructive">
                                {row.problems.map((p, i) => (
                                  <li key={i}>{problem(p as Problem)}</li>
                                ))}
                              </ul>
                            ) : row.changes.length > 0 ? (
                              <span className="text-muted-foreground">
                                {t("assets.import.changes", {
                                  fields: row.changes
                                    .map((f) => fieldName(f as ImportField))
                                    .join(", "),
                                })}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
