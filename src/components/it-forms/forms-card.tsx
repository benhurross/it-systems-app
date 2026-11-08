"use client";

import { FileText, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { ItFormRow } from "@/lib/api-types";
import type { ItFormKind } from "@/lib/it-forms";
import { ItFormDialog } from "./form-dialog";
import { NewFormMenu } from "./new-form-menu";

/** A person's IT forms, newest first, and a new one for them, their details filled in. */
export function ItFormsCard({ employeeId }: { employeeId: number }) {
  const t = useTranslations("itForms");
  const format = useFormat();
  const [creating, setCreating] = useState<ItFormKind | null>(null);
  const { data } = useApi<ItFormRow[]>(`/it-forms?employeeId=${employeeId}`);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? null : data.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" aria-hidden />
            {t("none")}
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {data.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/it-forms/${f.id}`} className="text-primary hover:underline">
                  {t(`kinds.${f.kind}`)}
                </Link>
                <span className="text-xs text-muted-foreground">{format.date(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <NewFormMenu onPick={setCreating} variant="outline" size="sm">
          <Plus />
          {t("new")}
        </NewFormMenu>
      </CardFooter>
      {creating && <ItFormDialog kind={creating} employeeId={employeeId} onClose={() => setCreating(null)} />}
    </Card>
  );
}
