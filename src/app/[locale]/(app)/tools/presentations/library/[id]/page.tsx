"use client";

import { ArrowLeft, ImageUp, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useId, useRef, useState } from "react";
import { StatusPage } from "@/components/status-page";
import { sendForm, useProblem, usePresentationMutation } from "@/components/tools/presentations/requests";
import { CoverSlide, DeckSlide, SlideFrame, useDeckPdf } from "@/components/tools/presentations/slides";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useApi } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { LibraryDeck } from "@/lib/api-types";
import { DECK_CATEGORIES, type DeckCategory, NUMBER_POSITIONS, type NumberPosition } from "@/lib/presentations";

const NONE = "none";

/** One deck's settings: its name and kind, its cover, the slide people write on, and its slides. */
export default function DeckSettingsPage({ params }: PageProps<"/[locale]/tools/presentations/library/[id]">) {
  const { id } = use(params);
  const t = useTranslations("presentations");
  const { data: decks } = useApi<LibraryDeck[]>("/presentations/decks");
  const deck = decks?.find((d) => d.id === Number(id));

  return (
    <div className="space-y-6">
      <Link href="/tools/presentations/library" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("deck.back")}
      </Link>
      {!decks ? (
        <Skeleton className="h-96 w-full" />
      ) : !deck ? (
        <StatusPage kind="notFound" home="/tools/presentations/library" />
      ) : (
        // Built afresh when the deck changes on the server (a new version, say).
        <DeckSettings key={`${deck.id}-${deck.version}`} deck={deck} />
      )}
    </div>
  );
}

function DeckSettings({ deck }: { deck: LibraryDeck }) {
  const t = useTranslations("presentations");
  const problem = useProblem();
  const doc = useDeckPdf(deck);
  const [name, setName] = useState(deck.name);
  const [category, setCategory] = useState<DeckCategory>(deck.category);
  const [active, setActive] = useState(deck.active);
  const [color, setColor] = useState(deck.color);
  const [textSlideId, setTextSlideId] = useState(deck.textSlideId);
  const [numberPosition, setNumberPosition] = useState<NumberPosition>(deck.numberPosition);
  const [slides, setSlides] = useState(deck.slides);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const pictureInput = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), category: useId(), active: useId(), color: useId(), colorHint: useId(), picture: useId(), pictureHint: useId(), writing: useId(), numbers: useId() };
  const validColor = /^[0-9A-Fa-f]{6}$/.test(color);

  const save = usePresentationMutation(
    () =>
      api(`/presentations/decks/${deck.id}`, {
        method: "PATCH",
        body: { name: name.trim(), category, active, color, textSlideId, numberPosition, slides: slides.map((s) => ({ id: s.id, title: s.title, default: s.default })) },
      }),
    { success: t("deck.saved") },
  );
  const removePicture = usePresentationMutation(() => api(`/presentations/decks/${deck.id}/cover`, { method: "DELETE" }), { success: t("deck.pictureRemoved") });

  const uploadPicture = usePresentationMutation(
    (file: File) => {
      const form = new FormData();
      form.set("file", file);
      return sendForm(`/presentations/decks/${deck.id}/cover`, form, "PUT");
    },
    { quiet: true, success: t("deck.pictureSaved") },
  );
  const choosePicture = (file: File | undefined) => {
    if (!file) return;
    setPictureError(null);
    uploadPicture.mutate(file, {
      onError: (error) => setPictureError(problem(error)),
      onSettled: () => {
        if (pictureInput.current) pictureInput.current.value = "";
      },
    });
  };

  const changeSlide = (slideId: number, change: Partial<(typeof slides)[number]>) => setSlides((current) => current.map((s) => (s.id === slideId ? { ...s, ...change } : s)));

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && validColor) save.mutate(undefined);
      }}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{deck.name}</h1>
          <p className="text-muted-foreground">
            {t(`categories.${deck.category}`)} · {t("admin.deckSlides", { count: deck.slides.length })}
          </p>
        </div>
        <Button type="submit" disabled={save.isPending || !name.trim() || !validColor}>
          <Save />
          {t("deck.save")}
        </Button>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("deck.details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field data-invalid={!name.trim()}>
                <FieldLabel htmlFor={ids.name}>{t("admin.name")}</FieldLabel>
                <Input id={ids.name} value={name} maxLength={200} aria-invalid={!name.trim()} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.category}>{t("admin.category")}</FieldLabel>
                <Select value={category} onValueChange={(v) => v && setCategory(v as DeckCategory)}>
                  <SelectTrigger id={ids.category} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`categories.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch id={ids.active} checked={active} onCheckedChange={setActive} aria-describedby={`${ids.active}-hint`} />
              <div className="space-y-1">
                <FieldLabel htmlFor={ids.active}>{t("deck.active")}</FieldLabel>
                <FieldDescription id={`${ids.active}-hint`}>{t("deck.activeHint")}</FieldDescription>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.writing}>{t("deck.writing")}</FieldLabel>
              <Select value={textSlideId ? String(textSlideId) : NONE} onValueChange={(v) => v && setTextSlideId(v === NONE ? null : Number(v))}>
                <SelectTrigger id={ids.writing} className="w-full" aria-describedby={`${ids.writing}-hint`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("deck.writingNone")}</SelectItem>
                  {slides.map((s, i) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {i + 1}. {s.title || t("builder.untitled", { n: i + 1 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription id={`${ids.writing}-hint`}>{t("deck.writingHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.numbers}>{t("deck.numbers")}</FieldLabel>
              <Select value={numberPosition} onValueChange={(v) => v && setNumberPosition(v as NumberPosition)}>
                <SelectTrigger id={ids.numbers} className="w-full" aria-describedby={`${ids.numbers}-hint`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NUMBER_POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`deck.positions.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription id={`${ids.numbers}-hint`}>{t("deck.numbersHint")}</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("deck.cover")}</CardTitle>
            <CardDescription>{t("deck.coverHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CoverSlide
              color={validColor ? color.toUpperCase() : deck.color}
              imageUrl={deck.hasCoverImage ? `/api/presentations/decks/${deck.id}/cover?v=${encodeURIComponent(deck.updatedAt)}` : null}
              text={{ title: t("deck.sampleTitle"), client: t("deck.sampleClient"), date: null, presenter: null }}
              label={t("deck.coverPreview")}
            />
            <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <Field data-invalid={!validColor}>
                <FieldLabel htmlFor={ids.color}>{t("deck.color")}</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t("deck.colorPicker")}
                    value={`#${validColor ? color : deck.color}`}
                    onChange={(e) => setColor(e.target.value.slice(1).toUpperCase())}
                    className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                  />
                  <Input
                    id={ids.color}
                    dir="ltr"
                    value={color}
                    maxLength={7}
                    aria-invalid={!validColor}
                    aria-describedby={ids.colorHint}
                    onChange={(e) => setColor(e.target.value.replace("#", "").toUpperCase())}
                  />
                </div>
                <FieldDescription id={ids.colorHint}>{t("deck.colorHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.picture}>{t("deck.picture")}</FieldLabel>
                <Input
                  ref={pictureInput}
                  id={ids.picture}
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  disabled={uploadPicture.isPending}
                  aria-describedby={ids.pictureHint}
                  aria-invalid={pictureError ? true : undefined}
                  onChange={(e) => choosePicture(e.target.files?.[0])}
                />
                <FieldDescription id={ids.pictureHint}>{t("deck.pictureHint")}</FieldDescription>
                {pictureError && (
                  <p role="alert" className="text-sm text-destructive">
                    {pictureError}
                  </p>
                )}
                {deck.hasCoverImage && (
                  <Button type="button" variant="outline" size="sm" className="self-start" disabled={removePicture.isPending} onClick={() => removePicture.mutate(undefined)}>
                    <X />
                    {t("deck.removePicture")}
                  </Button>
                )}
                {uploadPicture.isPending && (
                  <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <ImageUp className="size-4" aria-hidden />
                    {t("own.uploading")}
                  </p>
                )}
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="deck-slides" className="space-y-3">
        <div>
          <h2 id="deck-slides" className="font-medium">
            {t("deck.slides")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("deck.slidesHint")}</p>
        </div>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
          {slides.map((slide, i) => {
            const n = i + 1;
            return (
              <li key={slide.id} className="flex flex-col gap-2 rounded-xl border bg-card p-2">
                <SlideFrame>
                  <DeckSlide doc={doc} index={i} size={320} />
                </SlideFrame>
                <Input
                  value={slide.title}
                  maxLength={160}
                  aria-label={t("deck.slideName", { n })}
                  placeholder={t("builder.untitled", { n })}
                  onChange={(e) => changeSlide(slide.id, { title: e.target.value })}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={slide.default} onCheckedChange={(checked) => changeSlide(slide.id, { default: checked === true })} />
                    {t("deck.startChosen")}
                  </label>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {slide.hidden && <Badge variant="outline">{t("deck.hiddenSlide")}</Badge>}
                    <span className="tabular-nums">{n}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending || !name.trim() || !validColor}>
          <Save />
          {t("deck.save")}
        </Button>
      </div>
    </form>
  );
}
