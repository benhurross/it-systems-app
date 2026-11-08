"use client";

import { ClipboardCheck, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { WorkstationCheckRow } from "@/lib/api-types";
import { CheckDialog } from "./check-dialog";
import { ReadState } from "./read-state";

/** A computer's or a person's workstation checks, newest first; on a computer, a new one from here. */
export function WorkstationChecksCard({ assetId, employeeId }: { assetId?: number; employeeId?: number }) {
  const t = useTranslations("workstation");
  const format = useFormat();
  const [creating, setCreating] = useState(false);
  const query = assetId ? `assetId=${assetId}` : `employeeId=${employeeId}`;
  const { data } = useApi<WorkstationCheckRow[]>(`/workstation-checks?${query}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? null : data.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4" aria-hidden />
            {t("none")}
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {data.slice(0, 5).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <Link href={`/workstation-checks/${c.id}`} className="font-medium text-primary hover:underline">
                    {format.date(c.checkedAt)}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{assetId ? (c.employeeName ?? t("nobody")) : c.computerName}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <EnumBadge kind="workstationResult" value={c.result} />
                  <ReadState readAt={c.readAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {assetId && (
        <CardFooter>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            {t("new")}
          </Button>
        </CardFooter>
      )}
      {creating && assetId && <CheckDialog assetId={assetId} onClose={() => setCreating(false)} />}
    </Card>
  );
}
