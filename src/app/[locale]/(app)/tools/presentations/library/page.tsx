"use client";

import { ArrowLeft, Download, LibraryBig, Loader2, Plus, Settings2, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { sendForm, useProblem, usePresentationMutation } from "@/components/tools/presentations/requests";
import { DeckSlide, SlideFrame, useDeckPdf } from "@/components/tools/presentations/slides";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { LibraryDeck } from "@/lib/api-types";
import { formatBytes } from "@/lib/files";
import { DECK_CATEGORIES, type DeckCategory, MAX_DECK_BYTES } from "@/lib/presentations";

/** The library of master decks, for admins: adding, replacing and removing them. */
export default function LibraryPage() {
  const t = useTranslations("presentations");
  const { data: decks } = useApi<LibraryDeck[]>("/presentations/decks");
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-6">
      <Link href="/tools/presentations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("title")}
      </Link>
      <PageHeader
        title={t("library")}
        description={t("admin.intro")}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("admin.upload")}
          </Button>
        }
      />
      {!decks ? (
        <Skeleton className="h-64 w-full" />
      ) : decks.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title={t("admin.none")}
          description={t("admin.noneHint")}
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t("admin.upload")}
            </Button>
          }
        />
      ) : (
        DECK_CATEGORIES.map((category) => {
          const group = decks.filter((d) => d.category === category);
          return (
            group.length > 0 && (
              <section key={category} aria-labelledby={`category-${category}`} className="space-y-3">
                <h2 id={`category-${category}`} className="font-medium">
                  {t(`categories.${category}`)}
                </h2>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.map((deck) => (
                    <DeckCard key={deck.id} deck={deck} />
                  ))}
                </ul>
              </section>
            )
          );
        })
      )}
      {adding && <DeckUpload onClose={() => setAdding(false)} />}
    </div>
  );
}

function DeckCard({ deck }: { deck: LibraryDeck }) {
  const t = useTranslations("presentations");
  const format = useFormat();
  const locale = useLocale();
  const doc = useDeckPdf(deck);
  const [replacing, setReplacing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const remove = usePresentationMutation(() => api(`/presentations/decks/${deck.id}`, { method: "DELETE" }), { success: t("admin.deleted") });

  return (
    <li className="flex flex-col overflow-hidden rounded-xl bg-card shadow-glass glass-sheen ring-1 ring-foreground/10">
      <div className="p-3 pb-0">
        <SlideFrame>
          <DeckSlide doc={doc} index={0} size={420} />
        </SlideFrame>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium break-words">{deck.name}</h3>
          <Badge variant={deck.active ? "secondary" : "outline"}>{deck.active ? t("admin.inUse") : t("admin.hidden")}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("admin.deckSlides", { count: deck.slides.length })} · <span className="break-all">{deck.fileName}</span> · {formatBytes(deck.fileSize, locale)}
        </p>
        {deck.updatedBy && <p className="text-xs text-muted-foreground">{t("admin.byOn", { name: deck.updatedBy, date: format.date(deck.updatedAt) })}</p>}
        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          <Button size="sm" asChild>
            <Link href={`/tools/presentations/library/${deck.id}`}>
              <Settings2 />
              {t("admin.settings")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
            <Upload />
            {t("admin.replace")}
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={`/api/presentations/decks/${deck.id}/file`} aria-label={t("admin.downloadFile")} title={t("admin.downloadFile")}>
              <Download />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-destructive/10 hover:text-destructive"
            aria-label={`${t("admin.delete")}: ${deck.name}`}
            title={t("admin.delete")}
            onClick={() => setRemoving(true)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {replacing && <DeckUpload deck={deck} onClose={() => setReplacing(false)} />}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{t("admin.confirmDelete", { name: deck.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.confirmDeleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined)}>
              {t("admin.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Adding a deck, or (given `deck`) uploading a new version of one. */
function DeckUpload({ deck, onClose }: { deck?: LibraryDeck; onClose: () => void }) {
  const t = useTranslations("presentations");
  const common = useTranslations("common");
  const validation = useTranslations("validation");
  const problem = useProblem();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DeckCategory>("generic");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), category: useId(), file: useId(), fileHint: useId(), preview: useId(), previewHint: useId(), error: useId() };

  const upload = usePresentationMutation(
    async () => {
      const form = new FormData();
      if (!deck) {
        form.set("name", name.trim());
        form.set("category", category);
      }
      form.set("file", file!);
      if (preview) form.set("preview", preview);
      return deck ? sendForm(`/presentations/decks/${deck.id}/file`, form, "PUT") : sendForm("/presentations/decks", form);
    },
    { quiet: true, success: deck ? t("admin.replaced") : t("admin.added"), onSuccess: onClose },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deck && !name.trim()) return setError(`${t("admin.name")}: ${validation("required")}`);
    if (!file) return setError(t("errors.fileEmpty"));
    // The server checks again; checking here answers at once, without sending the file.
    if (file.size > MAX_DECK_BYTES) return setError(t("errors.deckSize"));
    upload.mutate(undefined, { onError: (err) => setError(problem(err)) });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !upload.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deck ? t("admin.replaceTitle", { name: deck.name }) : t("admin.uploadTitle")}</DialogTitle>
          <DialogDescription>{deck ? t("admin.replaceHint") : t("admin.intro")}</DialogDescription>
        </DialogHeader>
        <form id={ids.file + "-form"} onSubmit={submit} className="space-y-4" noValidate>
          {!deck && (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field>
                <FieldLabel htmlFor={ids.name}>{t("admin.name")}</FieldLabel>
                <Input id={ids.name} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
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
          )}
          <Field>
            <FieldLabel htmlFor={ids.file}>{t("admin.file")}</FieldLabel>
            <Input
              id={ids.file}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              aria-describedby={ids.fileHint}
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen && !deck && !name) setName(chosen.name.replace(/\.[^.]*$/, ""));
              }}
            />
            <FieldDescription id={ids.fileHint}>{t("admin.fileHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.preview}>{t("admin.preview")}</FieldLabel>
            <Input id={ids.preview} type="file" accept=".pdf,application/pdf" aria-describedby={ids.previewHint} onChange={(e) => setPreview(e.target.files?.[0] ?? null)} />
            <FieldDescription id={ids.previewHint}>{t("admin.previewHint")}</FieldDescription>
          </Field>
          {upload.isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("admin.uploading")}
            </p>
          )}
          {error && (
            <p id={ids.error} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" disabled={upload.isPending} onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button type="submit" form={ids.file + "-form"} disabled={upload.isPending}>
            <Upload />
            {deck ? t("admin.replaceAction") : t("admin.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

