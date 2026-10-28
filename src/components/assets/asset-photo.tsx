"use client";

import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useApi } from "@/hooks/use-api";
import type { Attachment } from "@/lib/api-types";

/**
 * The asset's photo: the latest uploaded with its documents as a Photo (a PNG or JPEG), opened full
 * size when clicked; a picture placeholder until there is one.
 */
export function AssetPhoto({ assetId, name }: { assetId: number; name: string }) {
  const t = useTranslations("assets");
  // The same list as the documents card, so an upload there shows here at once.
  const { data = [] } = useApi<Attachment[]>(`/attachments?entity=asset&id=${assetId}`);
  const photo = data.find((a) => a.kind === "photo" && a.contentType.startsWith("image/"));
  const frame = "flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-xl border bg-white shadow-sm";
  if (!photo) {
    return (
      <div className={`${frame} text-muted-foreground/60`} role="img" aria-label={t("noPhoto")} title={t("noPhotoHint")}>
        <ImageIcon className="size-16" strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <a href={`/api/attachments/${photo.id}?view`} target="_blank" rel="noopener" className={`${frame} p-2 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a file served by the app itself, of any size */}
      <img src={`/api/attachments/${photo.id}?view`} alt={t("photoOf", { name })} className="max-h-full max-w-full object-contain" />
    </a>
  );
}
