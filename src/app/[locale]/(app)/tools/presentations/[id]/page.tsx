"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Presentation,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { use, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { DateField, FormDialog, TextField } from "@/components/form";
import { usePresentationsAccess } from "@/components/tools/presentations/access";
import { fileNameOf, saveFile, sendForm, useProblem, usePresentationMutation } from "@/components/tools/presentations/requests";
import { CoverSlide, DeckSlide, OwnSlide, SlideFrame, useDeckPdf } from "@/components/tools/presentations/slides";
import { moved, useDragOrder } from "@/components/tools/reorder";
import { ToolAccess } from "@/components/tools/tool-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api";
import type { LibraryDeck, PresentationDetail } from "@/lib/api-types";
import { DECK_CATEGORIES, DEFAULT_DECK_COLOR, MAX_ITEMS, type PresentationItem } from "@/lib/presentations";
import { presentationDetails } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/** A key telling a slide apart while slides move about. Not a secret, so no crypto (plain http has none). */
const newKey = () => Math.random().toString(36).slice(2, 10);

const imageUrl = (presentation: number, key: string) => `/api/presentations/${presentation}/images/${key}`;
const coverUrl = (deck: LibraryDeck | undefined) => (deck?.hasCoverImage ? `/api/presentations/decks/${deck.id}/cover?v=${deck.version}` : null);

/** A presentation being put together: its slides in order, and the library to add from. */
export default function PresentationPage({ params }: PageProps<"/[locale]/tools/presentations/[id]">) {
  const { id } = use(params);
  const t = useTranslations("presentations");
  const access = usePresentationsAccess();
  const { data, error } = useApi<PresentationDetail>(access.allowed ? `/presentations/${id}` : null);
  const { data: decks } = useApi<LibraryDeck[]>(access.allowed ? "/presentations/decks" : null);

  return (
    <div className="space-y-6">
      <Link href="/tools/presentations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("builder.back")}
      </Link>
      {access.ready && !access.allowed ? (
        <div className="max-w-3xl rounded-xl border p-6">{access.status && <ToolAccess tool="presentations" status={access.status} />}</div>
      ) : error instanceof ApiError && error.status === 404 ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("errors.generic")}</p>
      ) : !data || !decks ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        // Built afresh for each presentation; its slides are kept here while they are changed.
        <Builder key={data.id} presentation={data} decks={decks} />
      )}
    </div>
  );
}

type Item = PresentationItem;

function Builder({ presentation, decks }: { presentation: PresentationDetail; decks: LibraryDeck[] }) {
  const t = useTranslations("presentations");
  const problem = useProblem();
  const [items, setItems] = useState<Item[]>(presentation.items);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState<"pptx" | "pdf" | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const save = usePresentationMutation((next: Item[]) => api(`/presentations/${presentation.id}`, { method: "PATCH", body: { items: next } }), {
    scope: `presentation-${presentation.id}`,
  });
  const change = (next: Item[]) => {
    setItems(next);
    // Saves run one after another, so the last change always lands last.
    saving.current = save.mutateAsync(next).catch(() => {});
  };
  const order = useDragOrder(items, change);

  const main = decks.find((d) => d.id === presentation.deckId);
  const color = main?.color ?? DEFAULT_DECK_COLOR;
  const deckOf = (id: number) => decks.find((d) => d.id === id);
  const missing = (item: Item) => item.type === "slide" && !deckOf(item.deckId)?.slides.some((s) => s.id === item.slideId);
  const full = items.length >= MAX_ITEMS;

  const add = (item: Item) => !full && change([...items, item]);
  const replace = (item: Item) => change(items.some((i) => i.key === item.key) ? items.map((i) => (i.key === item.key ? item : i)) : [...items, item]);

  const download = async (format: "pptx" | "pdf") => {
    setBusy(format);
    try {
      await saving.current;
      const res = await fetch(`/api/presentations/${presentation.id}/download?format=${format}`);
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
      saveFile(await res.blob(), fileNameOf(res, `presentation.${format}`));
      toast.success(t("builder.downloaded"));
    } catch (error) {
      toast.error(problem(error));
    } finally {
      setBusy(null);
    }
  };

  const cover = { title: presentation.title, client: presentation.client, contact: presentation.contact, date: presentation.date, presenter: presentation.presenter };

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{presentation.title}</h1>
          <p className="text-muted-foreground">
            {t("forClient", { client: presentation.client })} · {t("builder.count", { count: items.length })}
            <span className="ms-2 text-xs" aria-live="polite">
              {save.isPending ? t("builder.saving") : save.isSuccess ? t("builder.saved") : ""}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setDetails(true)}>
            <SquarePen />
            {t("details.edit")}
          </Button>
          <Button variant="outline" disabled={busy !== null || items.length === 0} onClick={() => download("pdf")}>
            {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
            {t("builder.downloadPdf")}
          </Button>
          <Button disabled={busy !== null || items.length === 0} onClick={() => download("pptx")}>
            {busy === "pptx" ? <Loader2 className="animate-spin" /> : <Download />}
            {t("builder.download")}
          </Button>
        </div>
      </header>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("builder.downloading")}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="chosen-slides" className="min-w-0 space-y-3">
          <div>
            <h2 id="chosen-slides" className="font-medium">
              {t("builder.chosen")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("builder.chosenHint")}</p>
          </div>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("builder.emptyChosen")}</p>
          ) : (
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
              {items.map((item, i) => {
                const n = i + 1;
                const deck = item.type === "slide" ? deckOf(item.deckId) : undefined;
                const slide = item.type === "slide" ? deck?.slides.find((s) => s.id === item.slideId) : undefined;
                const gone = missing(item);
                const label =
                  item.type === "cover"
                    ? t("builder.cover")
                    : item.type === "text"
                      ? item.title || t("builder.own")
                      : slide?.title || t("builder.untitled", { n: (deck?.slides.findIndex((s) => s.id === item.slideId) ?? -1) + 1 });
                return (
                  <li
                    key={item.key}
                    {...order.handlers(i)}
                    className={cn(
                      "flex cursor-grab flex-col gap-2 rounded-xl border bg-card p-2 transition-all active:cursor-grabbing",
                      gone ? "border-dashed border-destructive/50" : "hover:border-primary/40 hover:shadow-sm",
                      order.dragging === i && "opacity-40",
                      order.over === i && order.dragging !== i && "border-primary ring-2 ring-primary/30",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2 px-1 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums" aria-hidden>
                        {n}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium" title={label}>
                        <span className="sr-only">{t("builder.position", { n })}: </span>
                        {label}
                      </span>
                      {item.type === "text" && (
                        <Badge variant="secondary" className="shrink-0">
                          {t("builder.own")}
                        </Badge>
                      )}
                    </div>
                    {item.type === "cover" ? (
                      <CoverSlide color={color} imageUrl={coverUrl(main)} text={cover} />
                    ) : item.type === "text" ? (
                      <OwnSlide color={color} title={item.title} body={item.body} imageUrl={item.imageKey ? imageUrl(presentation.id, item.imageKey) : null} />
                    ) : (
                      <LibrarySlidePicture deck={deck} slideId={item.slideId} dimmed={gone} />
                    )}
                    {gone && (
                      <p className="px-1 text-xs text-destructive">
                        <span className="font-medium">{t("builder.missing")}.</span> {t("builder.missingHint")}
                      </p>
                    )}
                    <div className="flex flex-wrap justify-center gap-0.5 border-t pt-2">
                      <Button variant="ghost" size="icon-sm" aria-label={t("builder.moveEarlier", { n })} disabled={i === 0} onClick={() => change(moved(items, i, i - 1))}>
                        <ArrowLeft className="rtl:rotate-180" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("builder.moveLater", { n })} disabled={i === items.length - 1} onClick={() => change(moved(items, i, i + 1))}>
                        <ArrowRight className="rtl:rotate-180" />
                      </Button>
                      {item.type !== "slide" && (
                        <Button variant="ghost" size="icon-sm" aria-label={t("builder.edit", { n })} onClick={() => (item.type === "cover" ? setDetails(true) : setEditing(item))}>
                          <Pencil />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("builder.remove", { n })}
                        onClick={() => change(items.filter((x) => x.key !== item.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <AddSlides
          decks={decks}
          items={items}
          full={full}
          mainDeckId={presentation.deckId}
          onAdd={add}
          onAddOwn={() => setEditing("new")}
          onAddCover={() => add({ key: newKey(), type: "cover" })}
        />
      </div>

      {editing && (
        <OwnSlideDialog
          presentationId={presentation.id}
          color={color}
          item={editing === "new" ? null : editing.type === "text" ? editing : null}
          onSave={(item) => {
            replace(item);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {details && <DetailsDialog presentation={presentation} decks={decks} onClose={() => setDetails(false)} />}
    </>
  );
}

/** A library slide, drawn from its deck's PDF. */
function LibrarySlidePicture({ deck, slideId, dimmed, label, size }: { deck: LibraryDeck | undefined; slideId: number; dimmed?: boolean; label?: string; size?: number }) {
  const doc = useDeckPdf(deck);
  const index = deck?.slides.findIndex((s) => s.id === slideId) ?? -1;
  return (
    <SlideFrame dimmed={dimmed}>{index >= 0 ? <DeckSlide doc={doc} index={index} label={label} size={size} /> : <Presentation className="size-8 text-muted-foreground" aria-hidden />}</SlideFrame>
  );
}

/** The library to add from: a deck's slides, your own slide, and the cover. */
function AddSlides({
  decks,
  items,
  full,
  mainDeckId,
  onAdd,
  onAddOwn,
  onAddCover,
}: {
  decks: LibraryDeck[];
  items: Item[];
  full: boolean;
  mainDeckId: number | null;
  onAdd: (item: Item) => void;
  onAddOwn: () => void;
  onAddCover: () => void;
}) {
  const t = useTranslations("presentations");
  const usable = decks.filter((d) => d.active);
  const [deckId, setDeckId] = useState(() => (usable.some((d) => d.id === mainDeckId) ? mainDeckId! : (usable[0]?.id ?? null)));
  const deck = usable.find((d) => d.id === deckId);
  const pickerId = useId();
  const used = (slideId: number) => items.filter((i) => i.type === "slide" && i.deckId === deck?.id && i.slideId === slideId).length;

  return (
    <aside aria-labelledby="add-slides" className="space-y-4 rounded-xl bg-card p-4 shadow-glass glass-sheen ring-1 ring-foreground/10 lg:sticky lg:top-20">
      <div>
        <h2 id="add-slides" className="font-medium">
          {t("builder.add")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("builder.addHint")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={full} onClick={onAddOwn}>
          <Plus />
          {t("builder.addOwn")}
        </Button>
        {!items.some((i) => i.type === "cover") && (
          <Button variant="outline" size="sm" disabled={full} onClick={onAddCover}>
            <Plus />
            {t("builder.addCover")}
          </Button>
        )}
      </div>
      {usable.length > 0 && (
        <Field>
          <FieldLabel htmlFor={pickerId}>{t("builder.deck")}</FieldLabel>
          <Select value={deckId ? String(deckId) : ""} onValueChange={(v) => v && setDeckId(Number(v))}>
            <SelectTrigger id={pickerId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECK_CATEGORIES.map((category) => {
                const group = usable.filter((d) => d.category === category);
                return (
                  group.length > 0 && (
                    <SelectGroup key={category}>
                      <SelectLabel>{t(`categories.${category}`)}</SelectLabel>
                      {group.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                );
              })}
            </SelectContent>
          </Select>
        </Field>
      )}
      {deck && (
        <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pe-1" aria-label={deck.name}>
          {deck.slides.map((slide, i) => {
            const title = slide.title || t("builder.untitled", { n: i + 1 });
            const count = used(slide.id);
            return (
              <li key={slide.id}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => onAdd({ key: newKey(), type: "slide", deckId: deck.id, slideId: slide.id })}
                  aria-label={t("builder.addSlide", { title })}
                  className="group relative block w-full rounded-lg p-1 text-start outline-none hover:bg-brand-soft focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  <LibrarySlidePicture deck={deck} slideId={slide.id} size={220} />
                  <span className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Plus className="size-4" aria-hidden />
                  </span>
                  <span className="mt-1 flex items-center gap-1 px-0.5 text-xs">
                    <span className="min-w-0 flex-1 truncate" title={title}>
                      {title}
                    </span>
                    {count > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 text-success">
                        <Check className="size-3" aria-hidden />
                        {t("builder.inUse")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("builder.fillIns")}</p>
    </aside>
  );
}

/** Writing one of your own slides: a title, points, and a picture. Shown as it will look. */
function OwnSlideDialog({
  presentationId,
  color,
  item,
  onSave,
  onClose,
}: {
  presentationId: number;
  color: string;
  item: Extract<Item, { type: "text" }> | null;
  onSave: (item: Item) => void;
  onClose: () => void;
}) {
  const t = useTranslations("presentations");
  const common = useTranslations("common");
  const problem = useProblem();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [imageKey, setImageKey] = useState(item?.imageKey ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { title: useId(), body: useId(), bodyHint: useId(), picture: useId(), pictureHint: useId(), error: useId() };
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      setImageKey((await sendForm<{ key: string }>(`/presentations/${presentationId}/images`, form)).key);
    } catch (e) {
      setError(problem(e));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? t("own.edit") : t("own.add")}</DialogTitle>
          <DialogDescription className="sr-only">{t("own.bodyHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-5 overflow-y-auto px-1 py-1 md:grid-cols-2">
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor={ids.title}>{t("own.titleLabel")}</FieldLabel>
              <Input id={ids.title} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.body}>{t("own.body")}</FieldLabel>
              <Textarea id={ids.body} rows={6} value={body} maxLength={4000} aria-describedby={ids.bodyHint} onChange={(e) => setBody(e.target.value)} />
              <FieldDescription id={ids.bodyHint}>{t("own.bodyHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.picture}>{t("own.picture")}</FieldLabel>
              <Input
                ref={input}
                id={ids.picture}
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                aria-describedby={error ? `${ids.pictureHint} ${ids.error}` : ids.pictureHint}
                aria-invalid={error ? true : undefined}
                disabled={uploading}
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <FieldDescription id={ids.pictureHint}>{uploading ? t("own.uploading") : t("own.pictureHint")}</FieldDescription>
              {error && (
                <p id={ids.error} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {imageKey && (
                <Button variant="outline" size="sm" className="self-start" onClick={() => setImageKey(null)}>
                  <X />
                  {t("own.removePicture")}
                </Button>
              )}
            </Field>
          </div>
          <div className="space-y-2">
            <OwnSlide color={color} title={title} body={body} imageUrl={imageKey ? imageUrl(presentationId, imageKey) : null} label={t("own.picturePreview")} />
            {!imageKey && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ImagePlus className="size-3.5" aria-hidden />
                {t("own.pictureHint")}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            disabled={uploading || (!title.trim() && !body.trim() && !imageKey)}
            onClick={() => onSave({ key: item?.key ?? newKey(), type: "text", title: title.trim(), body, imageKey })}
          >
            {t("own.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Details = z.output<typeof presentationDetails>;

/** Who the presentation is for, and the deck that gives the cover its look. */
function DetailsDialog({ presentation, decks, onClose }: { presentation: PresentationDetail; decks: LibraryDeck[]; onClose: () => void }) {
  const t = useTranslations("presentations");
  const form = useForm<z.input<typeof presentationDetails>, unknown, Details>({
    resolver: zodResolver(presentationDetails),
    defaultValues: { title: presentation.title, client: presentation.client, contact: presentation.contact, date: presentation.date, presenter: presentation.presenter },
  });
  const [deckId, setDeckId] = useState(presentation.deckId);
  const deckChoices = decks.filter((d) => d.active || d.id === presentation.deckId);
  const save = usePresentationMutation((values: Details) => api(`/presentations/${presentation.id}`, { method: "PATCH", body: { ...values, ...(deckId ? { deckId } : {}) } }), {
    success: t("details.saved"),
    onSuccess: onClose,
  });
  return (
    <FormDialog open onOpenChange={(open) => !open && onClose()} title={t("details.editTitle")} form={form} onSubmit={(v) => save.mutate(v)} pending={save.isPending}>
      <TextField name="title" label={t("details.title")} description={t("details.titleHint")} />
      <TextField name="client" label={t("details.client")} />
      <TextField name="contact" label={t("details.contact")} description={t("details.contactHint")} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="date" label={t("details.date")} optional />
        <TextField name="presenter" label={t("details.presenter")} optional />
      </div>
      {deckChoices.length > 0 && <DeckChoice decks={deckChoices} value={deckId} onChange={setDeckId} />}
    </FormDialog>
  );
}

/** The deck the cover and your own slides take their look from. */
function DeckChoice({ decks, value, onChange }: { decks: LibraryDeck[]; value: number | null; onChange: (id: number) => void }) {
  const t = useTranslations("presentations");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("details.deck")}</FieldLabel>
      <Select value={value ? String(value) : ""} onValueChange={(v) => v && onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {decks.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              {d.name} · {t(`categories.${d.category}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
