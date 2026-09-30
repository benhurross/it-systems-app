"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, BookOpen, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { EnumBadge, SlaIndicator } from "@/components/badges";
import { FormDialog, TextareaField } from "@/components/form";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api";
import type { Article, Asset, Staff, TicketDetail } from "@/lib/api-types";
import { PRIORITIES, ref, type TicketStatus } from "@/lib/domain";
import { nextStatuses } from "@/lib/workflows";

type Mode = "it" | "requester";
const NONE = "__none";

export function TicketView({ id, mode }: { id: number; mode: Mode }) {
  const t = useTranslations();
  const { data: ticket, isLoading, error } = useApi<TicketDetail>(`/tickets/${id}`);
  const back = mode === "it" ? "/tickets" : "/requests";

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!ticket) {
    const missing = error instanceof ApiError && error.status === 404;
    return <StatusPage kind={missing ? "notFound" : "forbidden"} home={back} />;
  }

  return (
    <div className="space-y-6">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {mode === "it" ? t("tickets.backToList") : t("requests.title")}
      </Link>
      <Header ticket={ticket} mode={mode} />
      {mode === "requester" && ticket.status === "resolved" && <ConfirmFix ticket={ticket} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("tickets.description")}</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap">{ticket.description}</CardContent>
          </Card>
          {ticket.resolution && (
            <Card>
              <CardHeader>
                <CardTitle>{t("tickets.resolution")}</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap">{ticket.resolution}</CardContent>
            </Card>
          )}
          <Conversation ticket={ticket} />
          {mode === "it" && <History ticket={ticket} />}
        </div>
        <div className="space-y-6">
          <Details ticket={ticket} mode={mode} />
          <Suggestions issueType={ticket.issueType} />
        </div>
      </div>
    </div>
  );
}

function Header({ ticket, mode }: { ticket: TicketDetail; mode: Mode }) {
  const t = useTranslations();
  const user = useCurrentUser();
  const [resolving, setResolving] = useState(false);
  const move = useApiMutation(
    (status: TicketStatus) => api(`/tickets/${ticket.id}`, { method: "PATCH", body: { status } }),
    { success: t("tickets.updated") },
  );
  // Resolving needs a note, and a requester confirms from the card below rather than these buttons.
  const actions = mode === "it" ? nextStatuses(user.role, ticket.status) : [];

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground">{ref("ticket", ticket.id)}</span>
          <EnumBadge kind="ticketType" value={ticket.type} />
          <EnumBadge kind="ticketStatus" value={ticket.status} />
          <EnumBadge kind="priority" value={ticket.priority} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((status) => (
            <Button
              key={status}
              variant={status === "resolved" ? "default" : "outline"}
              disabled={move.isPending}
              onClick={() => (status === "resolved" ? setResolving(true) : move.mutate(status))}
            >
              {t(`tickets.actions.${status}`)}
            </Button>
          ))}
        </div>
      )}
      {resolving && <ResolveDialog ticket={ticket} onClose={() => setResolving(false)} />}
    </div>
  );
}

const resolveSchema = z.object({ resolution: z.string().trim().min(1).max(10_000) });

function ResolveDialog({ ticket, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const t = useTranslations("tickets");
  const form = useForm({ resolver: zodResolver(resolveSchema), defaultValues: { resolution: "" } });
  const resolve = useApiMutation(
    ({ resolution }: z.infer<typeof resolveSchema>) =>
      api(`/tickets/${ticket.id}`, { method: "PATCH", body: { status: "resolved", resolution } }),
    { success: t("updated"), form, onSuccess: onClose },
  );
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("resolveTitle", { ref: ref("ticket", ticket.id) })}
      form={form}
      onSubmit={(v) => resolve.mutate(v)}
      pending={resolve.isPending}
      submitLabel={t("actions.resolved")}
    >
      <TextareaField name="resolution" label={t("resolutionLabel")} rows={5} />
    </FormDialog>
  );
}

/** For the person who raised it: confirm the fix with a rating, or reopen. */
function ConfirmFix({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("requests");
  const format = useFormat();
  const [rating, setRating] = useState<number | null>(null);
  const close = useApiMutation(
    () => api(`/tickets/${ticket.id}`, { method: "PATCH", body: { status: "closed", satisfaction: rating } }),
    { success: t("thanks") },
  );
  const reopen = useApiMutation(() => api(`/tickets/${ticket.id}`, { method: "PATCH", body: { status: "open" } }), {
    success: t("reopenedToast"),
  });

  return (
    <Card className="border-success/40 bg-success-soft/40">
      <CardHeader>
        <CardTitle>{t("confirmTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("confirmText")} {ticket.closesAt && t("autoClose", { date: format.date(ticket.closesAt) })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p id="rating-label" className="text-sm font-medium">
            {t("rate")}
          </p>
          <div role="group" aria-labelledby="rating-label" className="flex gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("stars", { count: n })}
                aria-pressed={rating === n}
                onClick={() => setRating(n)}
              >
                <Star className={rating !== null && n <= rating ? "fill-warning text-warning" : "text-muted-foreground"} />
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => close.mutate(undefined)} disabled={close.isPending}>
            {t("confirm")}
          </Button>
          <Button variant="outline" onClick={() => reopen.mutate(undefined)} disabled={reopen.isPending}>
            {t("notFixed")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Conversation({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("tickets");
  const format = useFormat();
  const [text, setText] = useState("");
  const send = useApiMutation(
    (body: string) => api(`/tickets/${ticket.id}/comments`, { body: { body } }),
    { onSuccess: () => setText("") },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("conversation")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ticket.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noComments")}</p>
        ) : (
          <ol className="space-y-3">
            {ticket.comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted/60 p-3">
                <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.authorName}</span>
                  <time dateTime={c.createdAt}>{format.dateTime(c.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.body}</p>
              </li>
            ))}
          </ol>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate(text.trim());
          }}
        >
          <Textarea aria-label={t("addComment")} placeholder={t("addComment")} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!text.trim() || send.isPending}>
              {t("send")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function History({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("tickets");
  const format = useFormat();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("history")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-s ps-5">
          {ticket.history.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
              <p className="text-sm">{h.summary}</p>
              <p className="text-xs text-muted-foreground">
                {h.userName} · <time dateTime={h.at}>{format.dateTime(h.at)}</time>
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-1.5 text-sm @[16rem]:grid-cols-[8rem_1fr] @[16rem]:items-center @[16rem]:gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Details({ ticket, mode }: { ticket: TicketDetail; mode: Mode }) {
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const it = mode === "it";
  const { data: staff = [] } = useApi<Staff[]>(it ? "/staff" : null);
  const { data: assets = [] } = useApi<Asset[]>(it ? "/assets" : null);
  const update = useApiMutation((body: Record<string, unknown>) => api(`/tickets/${ticket.id}`, { method: "PATCH", body }), {
    success: t("tickets.updated"),
  });

  const edit = (label: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange} disabled={update.isPending}>
      <SelectTrigger aria-label={label} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tickets.details")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="@container divide-y">
          <Row label={t("tickets.requester")}>
            <span className="block truncate font-medium">{ticket.requesterName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {lookups.label("department", ticket.requesterDepartment)}
            </span>
          </Row>
          <Row label={t("tickets.location")}>{lookups.label("location", ticket.location)}</Row>
          <Row label={t("tickets.issueType")}>
            {it
              ? edit(t("tickets.issueType"), ticket.issueType, lookups.options("issue_type"), (issueType) => update.mutate({ issueType }))
              : lookups.label("issue_type", ticket.issueType)}
          </Row>
          <Row label={t("tickets.priority")}>
            {it ? (
              edit(
                t("tickets.priority"),
                ticket.priority,
                PRIORITIES.map((p) => ({ value: p, label: t(`enums.priority.${p}`) })),
                (priority) => update.mutate({ priority }),
              )
            ) : (
              <EnumBadge kind="priority" value={ticket.priority} />
            )}
          </Row>
          <Row label={t("tickets.assignee")}>
            {it
              ? edit(
                  t("tickets.assignee"),
                  ticket.assigneeId ?? NONE,
                  [{ value: NONE, label: t("tickets.unassigned") }, ...staff.map((s) => ({ value: s.id, label: s.name }))],
                  (v) => update.mutate({ assigneeId: v === NONE ? null : v }),
                )
              : (ticket.assigneeName ?? t("tickets.unassigned"))}
          </Row>
          {!it && ticket.asset && <Row label={t("tickets.asset")}>{ticket.asset.name}</Row>}
          {it && (
            <Row label={t("tickets.asset")}>
              {edit(
                t("tickets.asset"),
                ticket.assetId ? String(ticket.assetId) : NONE,
                [{ value: NONE, label: t("common.none") }, ...assets.map((a) => ({ value: String(a.id), label: `${a.name}${a.assignedName ? ` (${a.assignedName})` : ""}` }))],
                (v) => update.mutate({ assetId: v === NONE ? null : Number(v) }),
              )}
            </Row>
          )}
          <Row label={t("tickets.created")}>{format.dateTime(ticket.createdAt)}</Row>
          <Row label={t("tickets.due")}>
            <span className="flex flex-wrap items-center gap-2">
              {format.dateTime(ticket.dueAt)}
              <SlaIndicator ticket={ticket} />
            </span>
          </Row>
          {ticket.resolvedAt && <Row label={t("tickets.resolved")}>{format.dateTime(ticket.resolvedAt)}</Row>}
          {ticket.closedAt && <Row label={t("tickets.closed")}>{format.dateTime(ticket.closedAt)}</Row>}
          {ticket.satisfaction && (
            <Row label={t("tickets.satisfaction")}>
              <span aria-label={t("requests.stars", { count: ticket.satisfaction })}>{"★".repeat(ticket.satisfaction)}</span>
            </Row>
          )}
          {ticket.reopenCount > 0 && (
            <Row label={t("tickets.reopened")}>{format.number(ticket.reopenCount)}</Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Suggestions({ issueType }: { issueType: string }) {
  const t = useTranslations("tickets");
  const { data: articles = [] } = useApi<Article[]>("/kb");
  const matches = articles.filter((a) => a.status === "published" && a.issueType === issueType).slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-4" />
          {t("suggested")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
        ) : (
          <ul className="space-y-2">
            {matches.map((a) => (
              <li key={a.id}>
                <Link href={`/knowledge/${a.id}`} className="group flex items-center justify-between gap-2 text-sm hover:text-primary">
                  <span>{a.title}</span>
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
