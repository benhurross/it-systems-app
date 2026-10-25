"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { loadPdfJs, openPdf } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useFormat } from "@/hooks/use-format";
import type { FloorPlan } from "@/lib/api-types";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { outletProblems, pageTexts, readOutlets, type OutletProblem, type ReadOutlet } from "@/lib/floor-plan";

type Read = {
  file: File;
  page: { width: number; height: number };
  mark: { width: number; height: number };
  outlets: ReadOutlet[];
  pages: number;
  problems: [OutletProblem, number][];
};
const ERRORS = ["fileType", "fileSize", "fileEmpty", "unreadable"] as const;

/** The plan's first page read here: its size, and the outlets its labels mark. */
async function readDrawing(file: File): Promise<Read> {
  if (file.size === 0) throw new Error("fileEmpty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("fileSize");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffType(bytes) !== "application/pdf") throw new Error("fileType");
  let doc;
  try {
    doc = await openPdf(bytes);
  } catch {
    throw new Error("unreadable");
  }
  try {
    const { texts, size } = await pageTexts(await doc.getPage(1), await loadPdfJs());
    const { outlets, mark } = readOutlets(texts, size);
    const counts = new Map<OutletProblem, number>();
    for (const list of outletProblems(outlets)) for (const p of list) counts.set(p, (counts.get(p) ?? 0) + 1);
    return { file, page: size, mark, outlets, pages: doc.numPages, problems: [...counts] };
  } finally {
    void doc.destroy();
  }
}

async function send(read: Read, plan: FloorPlan | null, name: string, keep: boolean) {
  const form = new FormData();
  form.set("file", read.file);
  form.set("name", name);
  form.set("page", JSON.stringify(read.page));
  form.set("mark", JSON.stringify(read.mark));
  if (!keep) form.set("outlets", JSON.stringify(read.outlets.map((o) => ({ ...o, room: "", assetId: null, note: "" }))));
  const res = await fetch(plan ? `/api/floor-plans/${plan.id}/drawing` : "/api/floor-plans", { method: plan ? "PUT" : "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? "");
  return (plan ? { id: plan.id } : data) as { id: number };
}

/** A new plan, or a new drawing for one: the PDF is read first, showing what was found, then saved. */
export function UploadDialog({ plan, onClose, onSaved }: { plan: FloorPlan | null; onClose: () => void; onSaved: (id: number) => void }) {
  const t = useTranslations("floorPlan.uploadDialog");
  const tp = useTranslations("floorPlan.problemKinds");
  const tc = useTranslations("common");
  const format = useFormat();
  const queries = useQueryClient();
  const fileId = useId();
  const nameId = useId();
  const hintId = useId();
  const [read, setRead] = useState<Read | null>(null);
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(t(`errors.${(ERRORS as readonly string[]).includes(e.message) ? e.message : "generic"}` as "errors.generic"));
  const reading = useMutation({ mutationFn: readDrawing, onSuccess: setRead, onError: fail });
  const save = useMutation({
    mutationFn: () => send(read!, plan, name.trim(), keep),
    onSuccess: async ({ id }) => {
      toast.success(t("saved"));
      await queries.invalidateQueries();
      onSaved(id);
      onClose();
    },
    onError: fail,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan ? t("replaceTitle", { name: plan.name }) : t("title")}</DialogTitle>
          <DialogDescription>{t("intro")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
          <Field>
            <FieldLabel htmlFor={fileId}>{t("file")}</FieldLabel>
            <Input
              id={fileId}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setRead(null);
                setError(null);
                if (chosen) {
                  if (!plan && !name) setName(chosen.name.replace(/\.[^.]*$/, "").slice(0, 120));
                  reading.mutate(chosen);
                }
              }}
            />
          </Field>
          {!plan && (
            <Field>
              <FieldLabel htmlFor={nameId}>{t("name")}</FieldLabel>
              <Input id={nameId} value={name} maxLength={120} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          {reading.isPending && <p className="text-sm text-muted-foreground">{t("reading")}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {read && (
            <div className="space-y-2 text-sm" aria-live="polite">
              <p className="font-medium">{t("found", { count: read.outlets.length })}</p>
              {read.outlets.length === 0 && <p className="text-muted-foreground">{t("noLabels")}</p>}
              {read.pages > 1 && <p className="text-muted-foreground">{t("pages", { count: format.number(read.pages) })}</p>}
              {read.problems.length > 0 && (
                <>
                  <p>{t("checkCount", { count: read.problems.reduce((a, [, n]) => a + n, 0) })}</p>
                  <ul className="list-disc space-y-0.5 ps-5 text-muted-foreground">
                    {read.problems.map(([p, n]) => (
                      <li key={p}>
                        {format.number(n)} × {tp(p)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {plan && read && (
            <div className="space-y-2">
              <Label id={hintId}>{t("outletsChoice")}</Label>
              <RadioGroup aria-labelledby={hintId} value={keep ? "keep" : "read"} onValueChange={(v) => setKeep(v === "keep")}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="read" id={`${hintId}-read`} className="mt-0.5" />
                  <Label htmlFor={`${hintId}-read`} className="font-normal leading-snug">
                    {t("readNew", { count: read.outlets.length, current: format.number(plan.outlets.length) })}
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="keep" id={`${hintId}-keep`} className="mt-0.5" />
                  <Label htmlFor={`${hintId}-keep`} className="font-normal leading-snug">
                    {t("keep")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!read || (!plan && !name.trim()) || save.isPending} onClick={() => save.mutate()}>
            <Upload />
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
