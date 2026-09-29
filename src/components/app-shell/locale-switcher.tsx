"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getPathname, usePathname } from "@/i18n/navigation";

export function useSwitchLocale() {
  const locale = useLocale();
  const pathname = usePathname();
  return () => {
    // A new document rather than a client navigation: the root layout owns <html lang dir>
    // and its pre-paint scripts, which must not be re-rendered on the client.
    window.location.assign(getPathname({ href: pathname, locale: locale === "ar" ? "en" : "ar" }));
  };
}

export function LocaleSwitcher() {
  const t = useTranslations("locale");
  const locale = useLocale();
  const switchLocale = useSwitchLocale();

  return (
    <Button variant="ghost" onClick={switchLocale} lang={locale === "ar" ? "en" : "ar"} aria-label={t("other")}>
      <Languages />
      <span className="hidden sm:inline">{t("other")}</span>
    </Button>
  );
}
