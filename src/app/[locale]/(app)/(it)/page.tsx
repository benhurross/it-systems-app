"use client";

import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const user = useCurrentUser();
  return <PageHeader title={t("title")} description={t("welcome", { name: user.name })} />;
}
