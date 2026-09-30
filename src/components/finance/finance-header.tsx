"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

/** Title and the Budget / Purchases / Contracts / Vendors tabs shared by the finance pages. */
export function FinanceHeader({ actions }: { actions?: ReactNode }) {
  const t = useTranslations("finance");
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} actions={actions} />
      <SectionTabs
        items={[
          { href: "/finance/budget", label: t("tabs.budget") },
          { href: "/finance/purchases", label: t("tabs.purchases") },
          { href: "/finance/contracts", label: t("tabs.contracts") },
          { href: "/finance/vendors", label: t("tabs.vendors") },
        ]}
      />
    </>
  );
}
