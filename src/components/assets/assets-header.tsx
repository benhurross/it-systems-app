"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

/** Title and the Inventory / Discovery tabs shared by both asset pages. */
export function AssetsHeader({ actions }: { actions?: ReactNode }) {
  const t = useTranslations("assets");
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} actions={actions} />
      <SectionTabs
        items={[
          { href: "/assets/inventory", label: t("tabs.inventory") },
          { href: "/assets/discovery", label: t("tabs.discovery") },
        ]}
      />
    </>
  );
}
