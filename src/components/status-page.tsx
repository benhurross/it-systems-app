"use client";

import { SearchX, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Full-width message for a page the user cannot see: 403 or 404. */
export function StatusPage({ kind, home = "/" }: { kind: "forbidden" | "notFound"; home?: string }) {
  const t = useTranslations("errors");
  const Icon = kind === "forbidden" ? ShieldX : SearchX;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-7" />
      </span>
      <h1 className="text-xl font-semibold">{t(kind === "forbidden" ? "forbiddenTitle" : "notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t(kind)}</p>
      <Button asChild variant="outline">
        <Link href={home}>{t("goHome")}</Link>
      </Button>
    </div>
  );
}
