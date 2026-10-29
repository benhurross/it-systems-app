"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DateField, FormDialog, SelectField, TextareaField, TextField } from "@/components/form";
import { useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Article } from "@/lib/api-types";
import { KB_STATUSES } from "@/lib/domain";
import { kbArticle } from "@/lib/schemas";

type Input = z.input<typeof kbArticle>;
type Output = z.output<typeof kbArticle>;

/** Writes a new article, or edits `article`, in a dialog; the article opens once it is saved. */
export function ArticleDialog({ article, onClose }: { article?: Article; onClose: () => void }) {
  const t = useTranslations();
  const lookups = useLookups();
  const router = useRouter();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(kbArticle),
    defaultValues: article ?? { title: "", symptoms: "", resolution: "", status: "draft", issueType: null, cause: null, reviewDue: null },
  });
  const save = useApiMutation(
    (values: Output) =>
      article ? api<{ id: number }>(`/kb/${article.id}`, { method: "PATCH", body: values }) : api<{ id: number }>("/kb", { body: values }),
    {
      form,
      success: t("kb.saved"),
      onSuccess: (saved) => {
        onClose();
        router.push(`/knowledge/${saved.id}`);
      },
    },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={article ? t("kb.edit") : t("kb.new")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="title" label={t("kb.articleTitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="category" label={t("kb.category")} options={lookups.options("kb_category")} />
        <SelectField name="issueType" label={t("kb.issueType")} options={lookups.options("issue_type")} optional />
        <SelectField name="status" label={t("kb.status")} options={KB_STATUSES.map((s) => ({ value: s, label: t(`enums.kbStatus.${s}`) }))} />
        <DateField name="reviewDue" label={t("kb.reviewDue")} optional />
      </div>
      <TextareaField name="symptoms" label={t("kb.symptoms")} rows={3} />
      <TextareaField name="cause" label={t("kb.cause")} rows={2} optional />
      <TextareaField name="resolution" label={t("kb.resolution")} rows={8} />
    </FormDialog>
  );
}
