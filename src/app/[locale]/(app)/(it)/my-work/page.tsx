"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskBoard } from "@/components/team/task-board";
import { TaskSheet } from "@/components/team/task-sheet";
import { useMoveTask } from "@/components/team/team-tasks";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import type { TeamTask } from "@/lib/api-types";

/** Everyone in IT: the tasks given to them, to move along and update. */
export default function MyWorkPage() {
  return (
    <Suspense>
      <MyWork />
    </Suspense>
  );
}

function MyWork() {
  const t = useTranslations("team.myWork");
  const params = useSearchParams();
  const { data: tasks, isLoading } = useApi<TeamTask[]>("/team/tasks");
  const [open, setOpen] = useState<number | null>(Number(params.get("task")) || null);
  const move = useMoveTask();
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("tasks")}</h2>
        {isLoading || !tasks ? (
          <Skeleton className="h-48 w-full" />
        ) : tasks.length === 0 ? (
          <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <TaskBoard tasks={tasks} member onOpen={setOpen} onMove={(task, to) => move.mutate({ task, to })} />
        )}
      </section>
      {open && <TaskSheet id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
