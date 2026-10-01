"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

/** Title and the Directory / Onboarding / Offboarding / ID cards tabs shared by the people pages. */
export function PeopleHeader({ actions }: { actions?: ReactNode }) {
  const t = useTranslations("people");
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} actions={actions} />
      <SectionTabs
        items={[
          { href: "/people/directory", label: t("tabs.directory") },
          { href: "/people/onboarding", label: t("tabs.onboarding") },
          { href: "/people/offboarding", label: t("tabs.offboarding") },
          { href: "/people/id-cards", label: t("tabs.idCards") },
        ]}
      />
    </>
  );
}
