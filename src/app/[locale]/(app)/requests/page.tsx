"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";

export default function MyRequestsPage() {
  const t = useTranslations("nav");
  return <PageHeader title={t("myRequests")} />;
}
