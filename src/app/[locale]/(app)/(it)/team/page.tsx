"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { PageHeader } from "@/components/page-header";
import { TaskDialog } from "@/components/team/task-dialog";
import { TaskSheet } from "@/components/team/task-sheet";
import { TeamSettingsCard } from "@/components/team/team-settings";
import { TeamTasks } from "@/components/team/team-tasks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import type { TeamTask } from "@/lib/api-types";

/** The IT manager's: every task given to the team, to review and follow. The Admins' alone. */
export default function TeamPage() {
  return (
    <AreaGuard area="manager">
      <Suspense>
        <Team />
      </Suspense>
    </AreaGuard>
  );
}

function Team() {
  const t = useTranslations("team");
  const params = useSearchParams();
  const { data: tasks = [], isLoading } = useApi<TeamTask[]>("/team/tasks");
  // ?task= opens one, as the emails link to it.
  const [open, setOpen] = useState<number | null>(Number(params.get("task")) || null);
  const [adding, setAdding] = useState(false);
  const toReview = tasks.filter((x) => x.status === "done").length;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("newTask")}
          </Button>
        }
      />
      <Tabs defaultValue="board" className="gap-4">
        <TabsList className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="board">
            {t("tabs.board")}
            {toReview > 0 && <span className="ms-1 rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning">{t("toReviewCount", { count: toReview })}</span>}
          </TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          {!isLoading && tasks.length === 0 ? <p className="rounded-xl border p-6 text-sm text-muted-foreground">{t("noTasks")}</p> : <TeamTasks tasks={tasks} loading={isLoading} onOpen={setOpen} />}
        </TabsContent>
        <TabsContent value="settings">
          <TeamSettingsCard />
        </TabsContent>
      </Tabs>
      {adding && <TaskDialog onClose={() => setAdding(false)} onSaved={setOpen} />}
      {open && <TaskSheet id={open} manager onClose={() => setOpen(null)} />}
    </>
  );
}
