"use client";

import { Hint } from "@/components/hint";
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
import { carryOver, fitOutlets, readSvgPlan } from "@/lib/svg-plan";

type Read = {
  file: File;
  page: { width: number; height: number };
  mark: { width: number; height: number };
  outlets: ReadOutlet[];
  pages: number;
  problems: [OutletProblem, number][];
  format: "pdf" | "svg";
};
const ERRORS = ["fileType", "fileSize", "fileEmpty", "unreadable"] as const;

const problemCounts = (outlets: ReadOutlet[]) => {
  const counts = new Map<OutletProblem, number>();
  for (const list of outletProblems(outlets)) for (const p of list) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts];
};

/** An SVG plan read here: its size, and the outlets its labels mark. */
function readSvg(file: File, bytes: Uint8Array): Read {
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
  if (!/^\s*<(\?xml|svg|!--|!DOCTYPE svg)/i.test(text)) throw new Error("fileType");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("unreadable");
  let plan;
  try {
    plan = readSvgPlan(doc);
  } catch {
    throw new Error("unreadable");
  }
  return { file, page: { width: plan.width, height: plan.height }, mark: plan.mark, outlets: plan.outlets, pages: 1, problems: problemCounts(plan.outlets), format: "svg" };
}

/** The plan read here, a PDF's first page or an SVG: its size, and the outlets its labels mark. */
async function readDrawing(file: File): Promise<Read> {
  if (file.size === 0) throw new Error("fileEmpty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("fileSize");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniffType(bytes) !== "application/pdf") return readSvg(file, bytes);
  let doc;
  try {
    doc = await openPdf(bytes);
  } catch {
    throw new Error("unreadable");
  }
  try {
    const { texts, size } = await pageTexts(await doc.getPage(1), await loadPdfJs());
    const { outlets, mark } = readOutlets(texts, size);
    return { file, page: size, mark, outlets, pages: doc.numPages, problems: problemCounts(outlets), format: "pdf" };
  } finally {
    void doc.destroy();
  }
}

async function send(read: Read, plan: FloorPlan | null, name: string, keep: boolean, fit: number[] | null, outlets: unknown[]) {
  const form = new FormData();
  form.set("file", read.file);
  form.set("name", name);
  form.set("page", JSON.stringify(read.page));
  form.set("mark", JSON.stringify(read.mark));
  if (!keep) form.set("outlets", JSON.stringify(outlets));
  else if (fit) form.set("fit", JSON.stringify(fit));
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
  // Unchosen, the outlets are kept when they line up with the new drawing: what was entered stays.
  const [keepChoice, setKeep] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(t(`errors.${(ERRORS as readonly string[]).includes(e.message) ? e.message : "generic"}` as "errors.generic"));
  const reading = useMutation({ mutationFn: readDrawing, onSuccess: setRead, onError: fail });
  const fit = plan && read ? fitOutlets(plan.outlets, read.outlets) : null;
  // Within 2% of the sheet at worst: the same floor.
  const fits = !!fit && fit.error < 0.02;
  const keep = keepChoice ?? false;
  // Read from the new drawing, what was entered for the plan's outlets goes with their labels.
  const merged = read ? (plan ? carryOver(plan.outlets, read.outlets, fit?.matrix ?? null) : { outlets: read.outlets.map((o) => ({ ...o, room: "", assetId: null, note: "" })), carried: 0, lost: 0 }) : null;
  const save = useMutation({
    mutationFn: () => send(read!, plan, name.trim(), keep, keep && fit ? fit.matrix : null, merged!.outlets),
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
          <DialogTitle className="flex items-center gap-1.5">
            {plan ? t("replaceTitle", { name: plan.name }) : t("title")}
            <Hint>{t("intro")}</Hint>
          </DialogTitle>
          <DialogDescription className="sr-only">{t("intro")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
          <Field>
            <FieldLabel htmlFor={fileId}>{t("file")}</FieldLabel>
            <Input
              id={fileId}
              type="file"
              accept=".pdf,.svg,application/pdf,image/svg+xml"
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
                    {merged && merged.carried + merged.lost > 0 && (
                      <span className="block text-muted-foreground">
                        {t("carried", { count: merged.carried })} {merged.lost > 0 && t("notCarried", { count: merged.lost })}
                      </span>
                    )}
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="keep" id={`${hintId}-keep`} className="mt-0.5" />
                  <Label htmlFor={`${hintId}-keep`} className="block font-normal leading-snug">
                    {t("keep")}
                    <span className="block text-muted-foreground">
                      {fit ? t(fits ? "fitMatched" : "fitPoor", { count: fit.matched }) : t("fitNone")}
                    </span>
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
