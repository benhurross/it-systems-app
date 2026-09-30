"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

/** Title and the Risk register / Vulnerabilities tabs shared by both pages. */
export function RiskHeader({ actions }: { actions?: ReactNode }) {
  const t = useTranslations("risk");
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} actions={actions} />
      <SectionTabs
        items={[
          { href: "/risk/register", label: t("tabs.register") },
          { href: "/risk/vulnerabilities", label: t("tabs.vulnerabilities") },
        ]}
      />
    </>
  );
}
