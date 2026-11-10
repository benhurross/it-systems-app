"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { useCurrentUser } from "@/components/app-shell/current-user";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

const TABS = ["users", "lists", "serviceDesk", "monitoring", "email", "idCard", "labelPrinter", "tools", "api", "organisation", "audit"] as const;
const PATHS: Record<(typeof TABS)[number], string> = {
  users: "/settings/users",
  lists: "/settings/lists",
  serviceDesk: "/settings/service-desk",
  monitoring: "/settings/monitoring",
  email: "/settings/email",
  idCard: "/settings/id-card",
  labelPrinter: "/settings/label-printer",
  tools: "/settings/tools",
  api: "/settings/api",
  organisation: "/settings/organisation",
  audit: "/settings/audit",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("settings");
  // The audit log is the Admins' alone.
  const tabs = can(useCurrentUser().role, "manager") ? TABS : TABS.filter((tab) => tab !== "audit");
  return (
    <AreaGuard area="settings">
      <PageHeader title={t("title")} description={t("description")} />
      <SectionTabs items={tabs.map((tab) => ({ href: PATHS[tab], label: t(`tabs.${tab}`) }))} />
      {children}
    </AreaGuard>
  );
}
