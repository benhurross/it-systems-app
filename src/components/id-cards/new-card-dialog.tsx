"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, FormDialog, SelectField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Employee } from "@/lib/api-types";
import { ID_CARD_REASONS } from "@/lib/domain";
import { idCardCreate } from "@/lib/schemas";

/**
 * IT starting a card for someone in the directory, then opening it to add the photo and print.
 * From a profile the person is already chosen.
 */
export function NewCardDialog({ employeeId, onClose }: { employeeId?: number; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: employees = [] } = useApi<Employee[]>(employeeId ? null : "/employees");
  const form = useForm<z.input<typeof idCardCreate>, unknown, z.output<typeof idCardCreate>>({
    resolver: zodResolver(idCardCreate),
    defaultValues: { employeeId: employeeId ?? null, joinerId: null },
  });
  const create = useApiMutation((values: z.output<typeof idCardCreate>) => api<{ id: number }>("/id-cards", { body: values }), {
    form,
    onSuccess: (card) => router.push(`/people/id-cards/${card.id}`),
  });

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("idCards.new")}
      description={t("idCards.newHint")}
      form={form}
      onSubmit={(values) => create.mutate(values)}
      pending={create.isPending}
      submitLabel={t("idCards.create")}
    >
      {!employeeId && (
        <ComboboxField
          name="employeeId"
          label={t("idCards.employee")}
          options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: `${e.name} (${e.jobTitle})` }))}
        />
      )}
      <SelectField name="reason" label={t("idCards.reason")} options={ID_CARD_REASONS.map((r) => ({ value: r, label: t(`enums.idCardReason.${r}`) }))} />
    </FormDialog>
  );
}
