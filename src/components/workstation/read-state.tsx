"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { useFormat } from "@/hooks/use-format";

/** Whether the employee has said they read the check, and when. */
export function ReadState({ readAt }: { readAt: string | null }) {
  const t = useTranslations("workstation");
  const format = useFormat();
  return readAt ? (
    <StatusBadge tone="neutral">{t("readOn", { date: format.date(readAt) })}</StatusBadge>
  ) : (
    <StatusBadge tone="info">{t("notRead")}</StatusBadge>
  );
}
