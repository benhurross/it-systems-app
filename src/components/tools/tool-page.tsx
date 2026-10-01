"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Combine, FilePen, Hash, Images, LayoutGrid, Lock, Scissors, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { FormDialog, TextareaField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { MyTool } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { toolRequest } from "@/lib/schemas";
import type { ToolKey } from "@/lib/tools";

export const TOOL_ICONS = { pdf_merge: Combine, pdf_split: Scissors, pdf_organize: LayoutGrid, pdf_to_word: FilePen, images_to_pdf: Images, pdf_stamp: Hash } as const;

/** Says files stay on this computer: the tools work in the browser. */
export function PrivacyNote() {
  const t = useTranslations("tools");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success">
      <ShieldCheck className="size-4" aria-hidden />
      {t("privacyShort")}
    </span>
  );
}

/** Back to the list of tools. */
export function AllToolsLink() {
  const t = useTranslations("tools");
  return (
    <Link href="/tools" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4 rtl:rotate-180" />
      {t("allTools")}
    </Link>
  );
}

/** What the person can do about a tool they may not use yet: ask for it, see their request, or nothing. */
export function ToolAccess({ tool, status }: { tool: ToolKey; status: MyTool }) {
  const t = useTranslations("tools");
  const [asking, setAsking] = useState(false);
  if (status.status === "approval") {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          {t("needsApproval")}
        </p>
        <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
          {t("request")}
        </Button>
        {asking && <RequestToolDialog tool={tool} onClose={() => setAsking(false)} />}
      </div>
    );
  }
  if (status.status === "requested") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {t("requested")}
        {status.ticketId && (
          <Link href={`/requests/${status.ticketId}`} className="text-primary hover:underline">
            {t("viewRequest", { ref: ref("ticket", status.ticketId) })}
          </Link>
        )}
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">{status.status === "blocked" ? t("blocked") : t("unavailable")}</p>;
}

function RequestToolDialog({ tool, onClose }: { tool: ToolKey; onClose: () => void }) {
  const t = useTranslations("tools");
  const form = useForm<z.input<typeof toolRequest>, unknown, z.output<typeof toolRequest>>({ resolver: zodResolver(toolRequest), defaultValues: { note: "" } });
  const send = useApiMutation((values: z.output<typeof toolRequest>) => api<{ ticketId: number }>(`/tools/${tool}/request`, { body: values }), {
    form,
    onSuccess: ({ ticketId }) => {
      toast.success(t("requestSent", { ref: ref("ticket", ticketId) }));
      onClose();
    },
  });
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("requestTitle", { tool: t(`names.${tool}`) })}
      description={t("requestHint")}
      form={form}
      onSubmit={(v) => send.mutate(v)}
      pending={send.isPending}
      submitLabel={t("requestSend")}
    >
      <TextareaField name="note" label={t("requestNote")} rows={3} optional />
    </FormDialog>
  );
}
