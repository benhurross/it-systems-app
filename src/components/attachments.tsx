"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";
import type { Attachment } from "@/lib/api-types";
import { ATTACHMENT_KINDS_FOR, type AttachmentEntity, type AttachmentKind } from "@/lib/domain";
import { formatBytes, MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const ERRORS = ["fileType", "fileSize", "fileEmpty", "fileKind"] as const;

/** A record's documents: each opens, downloads or (unless read-only) is deleted; new ones upload below. */
export function AttachmentList({ entity, entityId, readOnly }: { entity: AttachmentEntity; entityId: number; readOnly?: boolean }) {
  const t = useTranslations("attachments");
  const kinds = useTranslations("enums.attachmentKind");
  const format = useFormat();
  const locale = useLocale();
  const { data = [], isLoading } = useApi<Attachment[]>(`/attachments?entity=${entity}&id=${entityId}`);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const remove = useApiMutation((a: Attachment) => api(`/attachments/${a.id}`, { method: "DELETE" }), { success: t("deleted") });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y text-sm" aria-label={t("title")}>
          {data.map((a) => {
            const Icon = a.contentType === "application/pdf" ? FileText : ImageIcon;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <a href={`/api/attachments/${a.id}?view`} target="_blank" rel="noopener" className="font-medium break-all hover:text-primary">
                      {a.name}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {kinds(a.kind)} · {formatBytes(a.size, locale)} · {a.uploadedByName} · {format.date(a.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button asChild variant="ghost" size="icon-sm">
                    <a href={`/api/attachments/${a.id}`} download aria-label={t("download", { name: a.name })}>
                      <Download />
                    </a>
                  </Button>
                  {!readOnly && (
                    <Button variant="ghost" size="icon-sm" aria-label={t("delete", { name: a.name })} onClick={() => setDeleting(a)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && <UploadForm entity={entity} entityId={entityId} />}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-all">{t("confirmDelete", { name: deleting?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDeleteText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && remove.mutate(deleting)}>
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadForm({ entity, entityId }: { entity: AttachmentEntity; entityId: number }) {
  const t = useTranslations("attachments");
  const kinds = useTranslations("enums.attachmentKind");
  const options = ATTACHMENT_KINDS_FOR[entity];
  const [kind, setKind] = useState<AttachmentKind>(options[0]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const kindId = useId();
  const fileId = useId();
  const hintId = useId();
  const errorId = useId();

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      const form = new FormData();
      form.set("entity", entity);
      form.set("entityId", String(entityId));
      form.set("kind", kind);
      form.set("file", chosen);
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
    },
    onSuccess: () => {
      toast.success(t("uploaded"));
      setFile(null);
      if (input.current) input.current.value = "";
    },
    onError: (e) => setError(t(`errors.${(ERRORS as readonly string[]).includes(e.message) ? e.message : "generic"}` as "errors.generic")),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) return setError(t("errors.fileEmpty"));
    // The server checks both again; checking here answers at once, without sending the file.
    if (file.size > MAX_UPLOAD_BYTES) return setError(t("errors.fileSize"));
    if (!sniffType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) return setError(t("errors.fileType"));
    upload.mutate(file);
  };

  return (
    // Side by side only when the form itself is wide enough: it sits in narrow columns and dialogs too.
    <form onSubmit={submit} className="@container space-y-3 rounded-lg border border-dashed p-3">
      <div className="grid gap-3 @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <Label htmlFor={kindId}>{t("type")}</Label>
          <Select value={kind} onValueChange={(v) => v && setKind(v as AttachmentKind)}>
            <SelectTrigger id={kindId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((k) => (
                <SelectItem key={k} value={k}>
                  {kinds(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={fileId}>{t("file")}</Label>
          <Input
            ref={input}
            id={fileId}
            type="file"
            accept={ACCEPT}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </div>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("hint")}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" disabled={upload.isPending}>
        <Upload />
        {t("upload")}
      </Button>
    </form>
  );
}

/** The documents card on a record's own page. */
export function AttachmentsCard({ entity, entityId, children }: { entity: AttachmentEntity; entityId: number; children?: React.ReactNode }) {
  const t = useTranslations("attachments");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <AttachmentList entity={entity} entityId={entityId} />
        {children}
      </CardContent>
    </Card>
  );
}

/** The paperclip in a list: how many documents a record has. The page opens the dialog. */
export function AttachmentsButton({ name, count, onOpen }: { name: string; count: number; onOpen: () => void }) {
  const t = useTranslations("attachments");
  return (
    <Button variant="ghost" size="sm" onClick={onOpen} aria-label={t("open", { name, count })}>
      <Paperclip />
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}

/**
 * A record's documents in a dialog, opened from a list. It belongs to the page, not the list's
 * row, so refreshing the list after an upload does not close it.
 */
export function AttachmentsDialog({
  entity,
  entityId,
  name,
  onClose,
}: {
  entity: AttachmentEntity;
  entityId: number;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("attachments");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="break-words">{name}</DialogDescription>
        </DialogHeader>
        <AttachmentList entity={entity} entityId={entityId} />
      </DialogContent>
    </Dialog>
  );
}
