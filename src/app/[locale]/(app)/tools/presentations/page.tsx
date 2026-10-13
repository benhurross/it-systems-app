"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, LibraryBig, Plus, Presentation, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EmptyState } from "@/components/empty-state";
import { DateField, FormDialog, SelectField, TextField } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { usePresentationsAccess } from "@/components/tools/presentations/access";
import { usePresentationMutation } from "@/components/tools/presentations/requests";
import { CoverSlide } from "@/components/tools/presentations/slides";
import { AllToolsLink, ToolAccess } from "@/components/tools/tool-page";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { LibraryDeck, PresentationDetail, PresentationSummary } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { DEFAULT_DECK_COLOR } from "@/lib/presentations";
import { presentationCreate } from "@/lib/schemas";

/** The person's presentations, and making a new one from a deck of the library. */
export default function PresentationsPage() {
  const t = useTranslations("presentations");
  const access = usePresentationsAccess();
  const { data: decks } = useApi<LibraryDeck[]>(access.allowed ? "/presentations/decks" : null);
  const { data: list } = useApi<PresentationSummary[]>(access.allowed ? "/presentations" : null);
  const [creating, setCreating] = useState(false);
  const usable = decks?.filter((d) => d.active) ?? [];

  return (
    <div className="space-y-6">
      <AllToolsLink />
      <PageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          access.allowed && (
            <>
              {access.admin && (
                <Button variant="outline" asChild>
                  <Link href="/tools/presentations/library">
                    <LibraryBig />
                    {t("library")}
                  </Link>
                </Button>
              )}
              <Button onClick={() => setCreating(true)} disabled={usable.length === 0}>
                <Plus />
                {t("new")}
              </Button>
            </>
          )
        }
      />
      {!access.ready ? (
        <Skeleton className="h-64 w-full max-w-5xl" />
      ) : !access.allowed ? (
        <div className="max-w-3xl rounded-xl border p-6">{access.status && <ToolAccess tool="presentations" status={access.status} />}</div>
      ) : !decks || !list ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Presentation}
          title={usable.length ? t("none") : t(access.admin ? "emptyLibraryAdmin" : "emptyLibraryUser")}
          description={usable.length ? t("noneHint") : undefined}
          action={
            usable.length ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("new")}
              </Button>
            ) : access.admin ? (
              <Button asChild>
                <Link href="/tools/presentations/library">
                  <LibraryBig />
                  {t("library")}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-label={t("mine")}>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <PresentationCard key={p.id} presentation={p} deck={decks.find((d) => d.id === p.deckId)} />
            ))}
          </ul>
        </section>
      )}
      {creating && <NewPresentation decks={usable} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** A presentation in the list: its cover, who it is for, and what can be done with it. */
function PresentationCard({ presentation: p, deck }: { presentation: PresentationSummary; deck: LibraryDeck | undefined }) {
  const t = useTranslations("presentations");
  const format = useFormat();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const duplicate = usePresentationMutation(() => api<PresentationDetail>(`/presentations/${p.id}/duplicate`, { body: { label: t("copyLabel") } }), {
    success: t("duplicated"),
    onSuccess: (copy) => router.push(`/tools/presentations/${copy.id}`),
  });
  const remove = usePresentationMutation(() => api(`/presentations/${p.id}`, { method: "DELETE" }), { success: t("deleted"), gone: `/presentations/${p.id}` });

  return (
    <li className="group flex flex-col overflow-hidden rounded-xl bg-card shadow-glass glass-sheen ring-1 ring-foreground/10 transition-shadow focus-within:ring-2 focus-within:ring-ring/50 hover:shadow-md">
      <Link href={`/tools/presentations/${p.id}`} className="block p-3 pb-0 outline-none" aria-label={t("open", { title: p.title })}>
        <CoverSlide
          color={deck?.color ?? DEFAULT_DECK_COLOR}
          imageUrl={deck?.hasCoverImage ? `/api/presentations/decks/${deck.id}/cover?v=${deck.version}` : null}
          text={{ title: p.title, client: p.client }}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
        <h2 className="font-medium break-words">
          <Link href={`/tools/presentations/${p.id}`} className="hover:underline">
            {p.title}
          </Link>
        </h2>
        <p className="text-sm break-words">{t("forClient", { client: p.client })}</p>
        <p className="text-xs text-muted-foreground">
          {t("slides", { count: p.slides })} · {t("updated", { date: format.date(p.updatedAt) })}
        </p>
        <div className="mt-auto flex justify-end gap-1 pt-2">
          <Button variant="ghost" size="sm" disabled={duplicate.isPending} onClick={() => duplicate.mutate(undefined)}>
            <Copy />
            {t("duplicate")}
          </Button>
          <Button variant="ghost" size="sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 />
            {t("delete")}
          </Button>
        </div>
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">{t("confirmDelete", { title: p.title })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDeleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined)}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

type Create = z.output<typeof presentationCreate>;

/** Who the presentation is for, and the deck to start from. */
function NewPresentation({ decks, onClose }: { decks: LibraryDeck[]; onClose: () => void }) {
  const t = useTranslations("presentations");
  const user = useCurrentUser();
  const router = useRouter();
  const form = useForm<z.input<typeof presentationCreate>, unknown, Create>({
    resolver: zodResolver(presentationCreate),
    defaultValues: { deckId: decks[0]?.id, title: "", client: "", contact: null, date: isoDate(new Date()), presenter: user.name },
  });
  const create = usePresentationMutation((values: Create) => api<PresentationDetail>("/presentations", { body: values }), {
    onSuccess: (p) => router.push(`/tools/presentations/${p.id}`),
  });
  return (
    <FormDialog open onOpenChange={(open) => !open && onClose()} title={t("new")} form={form} onSubmit={(v) => create.mutate(v)} submitLabel={t("details.create")} pending={create.isPending}>
      <SelectField
        name="deckId"
        label={t("details.deck")}
        description={t("details.deckHint")}
        options={decks.map((d) => ({ value: d.id, label: `${d.name} · ${t(`categories.${d.category}`)}` }))}
      />
      <TextField name="title" label={t("details.title")} description={t("details.titleHint")} />
      <TextField name="client" label={t("details.client")} />
      <TextField name="contact" label={t("details.contact")} description={t("details.contactHint")} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="date" label={t("details.date")} optional />
        <TextField name="presenter" label={t("details.presenter")} optional />
      </div>
    </FormDialog>
  );
}
