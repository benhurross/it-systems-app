"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

const TABS = ["users", "lists", "serviceDesk", "monitoring", "email", "idCard", "tools", "kpis", "organisation", "audit"] as const;
const PATHS: Record<(typeof TABS)[number], string> = {
  users: "/settings/users",
  lists: "/settings/lists",
  serviceDesk: "/settings/service-desk",
  monitoring: "/settings/monitoring",
  email: "/settings/email",
  idCard: "/settings/id-card",
  tools: "/settings/tools",
  kpis: "/settings/kpis",
  organisation: "/settings/organisation",
  audit: "/settings/audit",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("settings");
  return (
    <AreaGuard area="settings">
      <PageHeader title={t("title")} description={t("description")} />
      <SectionTabs items={TABS.map((tab) => ({ href: PATHS[tab], label: t(`tabs.${tab}`) }))} />
      {children}
    </AreaGuard>
  );
}
