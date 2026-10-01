"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, HandHelping, ImageOff, Minus, Plus, Printer, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useId, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge } from "@/components/badges";
import { CardFace, CardPhoto, designUrl, useCardLines } from "@/components/id-cards/card-face";
import { ArrangeOnCard, PhotoInput, usePhotoArranger, usePhotoError } from "@/components/id-cards/photo-arranger";
import { StatusPage } from "@/components/status-page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { IdCardDetail } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { blockOf, type FontChoice, firstAndLast, type Line, SIZE_STEP, SIZES } from "@/lib/id-card";
import { can } from "@/lib/permissions";

export default function IdCardPage({ params }: PageProps<"/[locale]/people/id-cards/[id]">) {
  const { id } = use(params);
  const { data: card, isLoading } = useApi<IdCardDetail>(`/id-cards/${id}`);
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!card) return <StatusPage kind="notFound" home="/people/id-cards" />;
  return <Editor card={card} />;
}

const FIELDS = ["name", "designation", "number", "nameFont", "nameSize", "designationFont", "designationSize"] as const;
type Draft = Pick<IdCardDetail, (typeof FIELDS)[number]>;
const draftOf = (card: IdCardDetail) => Object.fromEntries(FIELDS.map((f) => [f, card[f]])) as Draft;
const NUMBER = /^[A-Za-z0-9-]*$/;

/**
 * Everything IT does with one card: check and adjust the text, change the photo, print each
 * side on the card printer, and mark it printed.
 */
function Editor({ card }: { card: IdCardDetail }) {
  const t = useTranslations();
  const format = useFormat();
  const user = useCurrentUser();
  const router = useRouter();
  // Adjustments show on the card at once; printing waits until they are saved.
  const [draft, setDraft] = useState<Draft>(() => draftOf(card));
  const saved = draftOf(card);
  const dirty = FIELDS.some((f) => draft[f] !== saved[f]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const lines = useCardLines({ ...draft, number: draft.number || null });
  const [dialog, setDialog] = useState<"photo" | "printed" | "delete" | null>(null);
  const nameId = useId();
  const designationId = useId();
  const numberId = useId();
  const numberErrorId = useId();

  const nameMissing = draft.name.trim() === "";
  const numberInvalid = !NUMBER.test(draft.number ?? "");
  const save = useApiMutation((d: Draft) => api(`/id-cards/${card.id}`, { method: "PATCH", body: { ...d, number: d.number || null } }), {
    success: t("idCards.saved"),
  });
  const printed = useApiMutation(() => api(`/id-cards/${card.id}/printed`, { method: "POST" }), { success: t("idCards.markedPrinted") });
  const handOver = useApiMutation(() => api(`/id-cards/${card.id}/handed-over`, { method: "POST" }), { success: t("idCards.markedHandedOver") });
  const remove = useApiMutation(() => api(`/id-cards/${card.id}`, { method: "DELETE" }), {
    success: t("idCards.deleted"),
    gone: `/id-cards/${card.id}`,
    onSuccess: () => router.push("/people/id-cards"),
  });

  const front = designUrl(card.design, "front");
  const back = designUrl(card.design, "back");
  const photo = card.hasPhoto ? `/api/id-cards/${card.id}/photo?v=${encodeURIComponent(card.updatedAt)}` : null;
  const record = card.record.kind === "employee" ? `/people/directory/${card.record.id}` : "/people/onboarding";
  const pdf = (side: "front" | "back") => `/api/id-cards/${card.id}/pdf?side=${side}`;

  return (
    <div className="space-y-6">
      <Link href="/people/id-cards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("idCards.backToList")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <EnumBadge kind="idCardStage" value={card.stage} />
          <h1 className="text-2xl font-semibold tracking-tight break-words">{t("idCards.cardFor", { name: card.personName })}</h1>
          <p className="flex flex-wrap gap-x-2 text-muted-foreground">
            <span>{t(`enums.idCardReason.${card.reason}`)}</span>·<span>{t("idCards.startedOn", { date: format.date(card.createdAt) })}</span>
            {card.ticketId && (
              <>
                ·
                <Link href={`/tickets/${card.ticketId}`} className="text-primary hover:underline">
                  {t("idCards.viewRequest", { ref: ref("ticket", card.ticketId) })}
                </Link>
              </>
            )}
            ·
            <Link href={record} className="text-primary hover:underline">
              {card.record.kind === "employee" ? t("idCards.inDirectory") : t("idCards.inOnboarding")}
            </Link>
          </p>
          {card.note && (
            <p className="max-w-2xl text-sm break-words whitespace-pre-line">
              <span className="text-muted-foreground">{t("idCards.noteFrom", { name: card.personName })}</span> {card.note}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => setDialog("delete")}>
          <Trash2 />
          {t("common.delete")}
        </Button>
      </div>

      {(!front || !back) && (
        <Alert>
          <ImageOff />
          <AlertTitle>{t("idCards.noDesign")}</AlertTitle>
          <AlertDescription>
            {can(user.role, "settings") ? (
              <Link href="/settings/id-card" className="text-primary hover:underline">
                {t("idCards.noDesignAdmin")}
              </Link>
            ) : (
              t("idCards.noDesignStaff")
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("idCards.preview")}</CardTitle>
            <CardDescription>{t("idCards.previewHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid max-w-lg grid-cols-2 gap-4">
              <figure className="space-y-2">
                <CardFace
                  side="front"
                  design={front}
                  lines={lines}
                  photo={photo && <CardPhoto src={photo} />}
                  label={t("idCards.frontOf", { name: draft.name })}
                />
                <figcaption className="text-center text-sm text-muted-foreground">{t("idCards.frontSide")}</figcaption>
              </figure>
              <figure className="space-y-2">
                <CardFace side="back" design={back} label={t("idCards.backOf", { name: draft.name })} />
                <figcaption className="text-center text-sm text-muted-foreground">{t("idCards.backSide")}</figcaption>
              </figure>
            </div>
            {!photo && <p className="text-sm text-warning">{t("idCards.noPhoto")}</p>}
            <Button variant="outline" onClick={() => setDialog("photo")}>
              <Camera />
              {photo ? t("idCards.changePhoto") : t("idCards.addPhoto")}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!nameMissing && !numberInvalid) save.mutate(draft);
              }}
              noValidate
              // The header sits inside the form, so the form spaces the card's parts itself.
              className="flex flex-col gap-6"
            >
              <CardHeader>
                <CardTitle>{t("idCards.text")}</CardTitle>
                <CardDescription>{t("idCards.textHint")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>{t("idCards.nameOnCard")}</Label>
                  <Input id={nameId} value={draft.name} dir="ltr" aria-invalid={nameMissing || undefined} onChange={(e) => set({ name: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-8 py-1 text-start whitespace-normal"
                      disabled={firstAndLast(draft.name) === draft.name.trim()}
                      onClick={() => set({ name: firstAndLast(draft.name) })}
                    >
                      {t("idCards.firstAndLast")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto min-h-8 py-1 text-start whitespace-normal"
                      disabled={draft.name === card.record.name}
                      onClick={() => set({ name: card.record.name })}
                    >
                      {t("idCards.fromRecord", { what: t("idCards.whatName") })}
                    </Button>
                  </div>
                  <Fit
                    kind="name"
                    what={t("idCards.whatName")}
                    font={draft.nameFont}
                    size={draft.nameSize}
                    lines={lines}
                    onChange={(font, size) => set({ nameFont: font, nameSize: size })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={designationId}>{t("idCards.designation")}</Label>
                  <Input id={designationId} value={draft.designation} dir="ltr" onChange={(e) => set({ designation: e.target.value })} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-8 py-1 text-start whitespace-normal"
                    disabled={draft.designation === card.record.designation}
                    onClick={() => set({ designation: card.record.designation })}
                  >
                    {t("idCards.fromRecord", { what: t("idCards.whatDesignation") })}
                  </Button>
                  <Fit
                    kind="designation"
                    what={t("idCards.whatDesignation")}
                    font={draft.designationFont}
                    size={draft.designationSize}
                    lines={lines}
                    onChange={(font, size) => set({ designationFont: font, designationSize: size })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={numberId}>{t("idCards.number")}</Label>
                  <Input
                    id={numberId}
                    value={draft.number ?? ""}
                    dir="ltr"
                    className="max-w-48"
                    aria-invalid={numberInvalid || undefined}
                    aria-describedby={numberInvalid ? numberErrorId : undefined}
                    onChange={(e) => set({ number: e.target.value || null })}
                  />
                  {numberInvalid && (
                    <p id={numberErrorId} className="text-sm text-destructive">
                      {t("validation.employeeNumber")}
                    </p>
                  )}
                  {!draft.number && <p className="text-xs text-muted-foreground">{t("idCards.noNumber")}</p>}
                </div>
              </CardContent>
              <CardFooter className="flex-wrap justify-end gap-2">
                {dirty && <span className="me-auto text-sm text-muted-foreground">{t("idCards.unsaved")}</span>}
                <Button type="button" variant="outline" disabled={!dirty} onClick={() => setDraft(saved)}>
                  {t("idCards.undo")}
                </Button>
                <Button type="submit" disabled={!dirty || nameMissing || numberInvalid || save.isPending}>
                  {t("common.save")}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("idCards.print")}</CardTitle>
              <CardDescription>{t("idCards.printerHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm">
                <Step n={1}>
                  <PrintLink href={pdf("front")} label={t("idCards.printFront")} disabled={dirty} />
                </Step>
                <Step n={2}>
                  <p>{t("idCards.flip")}</p>
                </Step>
                <Step n={3}>
                  <PrintLink href={pdf("back")} label={t("idCards.printBack")} disabled={dirty} />
                </Step>
                <Step n={4}>
                  {card.status === "printed" && card.printedAt ? (
                    <p className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {t("idCards.printedBy", { date: format.date(card.printedAt), name: card.printedBy ?? "" })}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <Button disabled={dirty || printed.isPending} onClick={() => setDialog("printed")}>
                        <CheckCircle2 />
                        {t("idCards.markPrinted")}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {card.ticketId ? t("idCards.markPrintedTicket") : card.joinerId ? t("idCards.markPrintedJoiner") : t("idCards.markPrintedPlain")}
                      </p>
                    </div>
                  )}
                </Step>
                {card.status === "printed" && (
                  <Step n={5}>
                    {card.stage === "handed_over" ? (
                      <p className="flex items-center gap-2 text-success">
                        <CheckCircle2 className="size-4" aria-hidden />
                        {card.handedOverAt
                          ? t("idCards.handedOverBy", { date: format.date(card.handedOverAt), name: card.handedOverBy ?? "" })
                          : t("idCards.confirmedBy", { name: card.personName, date: format.date(card.ticketClosedAt ?? card.printedAt!) })}
                      </p>
                    ) : card.ticketId ? (
                      <p className="text-muted-foreground">{t("idCards.awaitingConfirmation", { name: card.personName, ref: ref("ticket", card.ticketId) })}</p>
                    ) : (
                      <div className="space-y-1">
                        <Button variant="outline" disabled={handOver.isPending} onClick={() => handOver.mutate(undefined)}>
                          <HandHelping />
                          {t("idCards.markHandedOver")}
                        </Button>
                        <p className="text-xs text-muted-foreground">{t("idCards.markHandedOverHint")}</p>
                      </div>
                    )}
                  </Step>
                )}
              </ol>
              {dirty && <p className="mt-4 text-sm text-muted-foreground">{t("idCards.saveFirst")}</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {dialog === "photo" && <PhotoDialog card={card} design={front} lines={lines} onClose={() => setDialog(null)} />}
      <AlertDialog open={dialog === "printed" || dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog === "delete" ? t("idCards.confirmDelete") : t("idCards.confirmPrinted")}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "delete"
                ? t("idCards.confirmDeleteText")
                : card.ticketId
                  ? t("idCards.confirmPrintedTicket", { ref: ref("ticket", card.ticketId), name: card.personName })
                  : t("idCards.confirmPrintedText")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            {dialog === "delete" ? (
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined)}>
                {t("common.delete")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={() => printed.mutate(undefined)}>{t("idCards.markPrinted")}</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  const format = useFormat();
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums" aria-hidden>
        {format.number(n)}
      </span>
      <div className="min-w-0 pt-0.5">{children}</div>
    </li>
  );
}

/** Opens one side's PDF in a new tab, to print from the browser's print dialog. */
function PrintLink({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled) {
    return (
      <Button variant="outline" disabled>
        <Printer />
        {label}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline">
      <a href={href} target="_blank" rel="noopener">
        <Printer />
        {label}
      </a>
    </Button>
  );
}

const FONT_CHOICES: FontChoice[] = ["auto", "regular", "narrow"];

/**
 * Size and font for the name or the designation. Auto lets the card fit the text; a chosen size
 * or font is kept, except that text too long for it still shrinks or wraps to stay on the card.
 */
function Fit({
  kind,
  what,
  font,
  size,
  lines,
  onChange,
}: {
  kind: "name" | "designation";
  what: string;
  font: FontChoice;
  size: number | null;
  lines: Line[] | null;
  onChange: (font: FontChoice, size: number | null) => void;
}) {
  const t = useTranslations("idCards");
  const format = useFormat();
  const limits = SIZES[kind];
  const line = blockOf(lines, kind);
  const count = lines?.filter((l) => l.kind === kind).length ?? 0;
  const current = size ?? line?.size ?? limits.default;
  const step = (by: number) => onChange(font, Math.min(limits.max, Math.max(limits.min, current + by)));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1" role="group" aria-label={t("sizeOf", { what })}>
          <span className="me-1 text-sm text-muted-foreground" aria-hidden>
            {t("size")}
          </span>
          <Button type="button" variant="outline" size="icon-sm" aria-label={t("smaller", { what })} disabled={current <= limits.min} onClick={() => step(-SIZE_STEP)}>
            <Minus />
          </Button>
          <span className="min-w-14 text-center text-sm tabular-nums">{size === null ? t("fonts.auto") : t("points", { size: format.number(size) })}</span>
          <Button type="button" variant="outline" size="icon-sm" aria-label={t("larger", { what })} disabled={current >= limits.max} onClick={() => step(SIZE_STEP)}>
            <Plus />
          </Button>
          {size !== null && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(font, null)}>
              {t("autoSize")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground" aria-hidden>
            {t("font")}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={font}
            onValueChange={(value) => value && onChange(value as FontChoice, size)}
            aria-label={t("fontOf", { what })}
            className="flex-wrap"
          >
            {FONT_CHOICES.map((f) => (
              <ToggleGroupItem key={f} value={f}>
                {t(`fonts.${f}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>
      {line && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("fitNow", { font: t(`fonts.${line.font}`), size: format.number(line.size), lines: count })}
        </p>
      )}
    </div>
  );
}

/** Choosing a new photo and arranging it in the window, on the card as it will print. */
function PhotoDialog({ card, design, lines, onClose }: { card: IdCardDetail; design: string | null; lines: Line[] | null; onClose: () => void }) {
  const t = useTranslations("idCards");
  const tc = useTranslations("common");
  const arranger = usePhotoArranger();
  const explain = usePhotoError();
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.set("photo", await arranger.save(), "photo.jpg");
      const res = await fetch(`/api/id-cards/${card.id}/photo`, { method: "PUT", body });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
    },
    onSuccess: () => {
      toast.success(t("photoSaved"));
      onClose();
    },
    onError: (e) => setError(explain(e.message)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card.hasPhoto ? t("changePhoto") : t("addPhoto")}</DialogTitle>
          <DialogDescription>{t("photoDialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-56">
            <ArrangeOnCard arranger={arranger} design={design} lines={lines} label={t("previewLabel", { name: card.name })} />
          </div>
          <PhotoInput arranger={arranger} error={error} onError={setError} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!arranger.source || upload.isPending} onClick={() => upload.mutate()}>
            {t("savePhoto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
