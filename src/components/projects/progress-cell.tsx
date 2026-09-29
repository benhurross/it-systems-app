"use client";

import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { useFormat } from "@/hooks/use-format";
import { projectProgress } from "@/lib/projects";

/** Share of a project's tasks that are done, as a bar with the count beside it. */
export function TaskProgress({ done, total }: { done: number; total: number }) {
  const t = useTranslations("projects");
  const format = useFormat();
  const label = t("tasksDone", { done: format.number(done), total: format.number(total) });
  return (
    <div className="flex min-w-36 items-center gap-2">
      <Progress value={projectProgress(done, total) * 100} aria-label={label} />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" dir="ltr">
        {format.number(done)}/{format.number(total)}
      </span>
    </div>
  );
}
