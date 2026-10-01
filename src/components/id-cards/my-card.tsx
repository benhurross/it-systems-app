"use client";

import { CheckCircle2, Eye, IdCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { MyCard } from "@/lib/api-types";
import { ref } from "@/lib/domain";
import { CardFace, CardPhoto, designUrl, useCardLines } from "./card-face";

/**
 * The employee's own ID card on their dashboard: once IT has printed it, the card as printed with
 * a preview of both sides, ready to collect until they confirm they have it, then handed over. A
 * request still with IT shows here too.
 */
export function MyIdCard() {
  const t = useTranslations("home.myCard");
  const format = useFormat();
  const { data } = useApi<MyCard>("/id-cards/mine");
  const [previewing, setPreviewing] = useState(false);
  const card = data?.printed ?? null;
  const lines = useCardLines(card);
  if (!data || (!card && !data.waiting)) return null;

  const front = designUrl(data.design, "front");
  const photo = card?.hasPhoto ? `/api/id-cards/mine/photo?v=${encodeURIComponent(card.updatedAt)}` : null;
  const face = (side: "front" | "back", label: string, className?: string) => (
    <CardFace
      side={side}
      design={side === "front" ? front : designUrl(data.design, "back")}
      lines={lines}
      photo={photo && <CardPhoto src={photo} />}
      label={label}
      className={className}
    />
  );

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-x-5 gap-y-4">
        {card && <div className="w-20 shrink-0">{face("front", t("frontLabel"))}</div>}
        <div className="min-w-0 flex-1 basis-56 space-y-2">
          {card && card.printedAt && (
            <>
              <CardBadge card={card} />
              {card.stage === "handed_over" ? (
                <p className="text-sm text-muted-foreground">
                  {t("printedOn", { date: format.date(card.printedAt) })}
                  {card.handedOverAt && ` · ${t("handedOverOn", { date: format.date(card.handedOverAt) })}`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {card.ticketId ? (
                    <>
                      {t("readyText", { date: format.date(card.printedAt) })}{" "}
                      <Link href={`/requests/${card.ticketId}`} className="text-primary hover:underline">
                        {t("confirmLink", { ref: ref("ticket", card.ticketId) })}
                      </Link>
                    </>
                  ) : (
                    t("readyCollect", { date: format.date(card.printedAt) })
                  )}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
                <Eye />
                {t("preview")}
              </Button>
            </>
          )}
          {data.waiting && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <StatusBadge tone="info">{t("withIt")}</StatusBadge>
              <span className="text-muted-foreground">{t("requestedOn", { date: format.date(data.waiting.createdAt) })}</span>
              {data.waiting.ticketId && (
                <Link href={`/requests/${data.waiting.ticketId}`} className="text-primary hover:underline">
                  {t("viewRequest", { ref: ref("ticket", data.waiting.ticketId) })}
                </Link>
              )}
            </p>
          )}
        </div>
      </CardContent>
      {card && card.printedAt && (
        <Dialog open={previewing} onOpenChange={setPreviewing}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <CardBadge card={card} />
                {t("printedOn", { date: format.date(card.printedAt) })}
              </DialogDescription>
            </DialogHeader>
            <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-4">
              <figure className="space-y-2">
                {face("front", t("frontLabel"))}
                <figcaption className="text-center text-sm text-muted-foreground">{t("front")}</figcaption>
              </figure>
              <figure className="space-y-2">
                {face("back", t("backLabel"))}
                <figcaption className="text-center text-sm text-muted-foreground">{t("back")}</figcaption>
              </figure>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

/** Green and checked once the card is in their hands; until then, ready to collect. */
function CardBadge({ card }: { card: NonNullable<MyCard["printed"]> }) {
  const t = useTranslations("home.myCard");
  return card.stage === "handed_over" ? (
    <StatusBadge tone="success" icon={CheckCircle2}>
      {t("handedOver")}
    </StatusBadge>
  ) : (
    <StatusBadge tone="info" icon={IdCard}>
      {t("ready")}
    </StatusBadge>
  );
}
