"use client";

import { ScreenShare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { anydeskLink, formatAnydeskId } from "@/lib/anydesk";

/** Opens the AnyDesk app on this computer, connecting to the device with this AnyDesk ID. */
export function AnydeskConnect({ id, device, size }: { id: string; device?: string; size?: "sm" }) {
  const t = useTranslations("assets");
  return (
    <Button variant="outline" size={size} asChild>
      <a href={anydeskLink(id)} aria-label={device ? t("connectTo", { device }) : undefined} title={formatAnydeskId(id)}>
        <ScreenShare />
        {t("connect")}
      </a>
    </Button>
  );
}
