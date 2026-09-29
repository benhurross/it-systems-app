"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

/** Title and the Status / Daily checks tabs shared by both network pages. */
export function NetworkHeader() {
  const t = useTranslations("network");
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <SectionTabs
        items={[
          { href: "/network/status", label: t("tabs.status") },
          { href: "/network/daily", label: t("tabs.daily") },
        ]}
      />
    </>
  );
}
