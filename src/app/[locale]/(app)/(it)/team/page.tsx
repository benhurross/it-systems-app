"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { AreaGuard } from "@/components/app-shell/area-guard";
import { PageHeader } from "@/components/page-header";
import { TeamPlanning } from "@/components/team/planning";
import { TaskDialog } from "@/components/team/task-dialog";
import { TeamDashboard } from "@/components/team/team-dashboard";
import { TaskSheet } from "@/components/team/task-sheet";
import { TeamSettingsCard } from "@/components/team/team-settings";
import { TeamTasks } from "@/components/team/team-tasks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import type { TeamTask } from "@/lib/api-types";

const TABS = ["dashboard", "board", "planning", "settings"] as const;
type Tab = (typeof TABS)[number];

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
  // The tab shown is kept in the address (?tab=), so a reload or a link comes back to it.
  const [tab, setTab] = useState(() => (TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : params.get("task") ? "board" : "dashboard"));
  const chooseTab = (value: string) => {
    setTab(value as Tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(window.history.state, "", url);
  };
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
      <Tabs value={tab} onValueChange={chooseTab} className="gap-4">
        <TabsList className="max-w-full flex-wrap group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="dashboard">{t("tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="board">
            {t("tabs.board")}
            {toReview > 0 && <span className="ms-1 rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning">{t("toReviewCount", { count: toReview })}</span>}
          </TabsTrigger>
          <TabsTrigger value="planning">{t("tabs.planning")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          {!isLoading && tasks.length === 0 && <p className="mb-3 text-sm text-muted-foreground">{t("noTasks")}</p>}
          <TeamTasks tasks={tasks} loading={isLoading} onOpen={setOpen} />
        </TabsContent>
        <TabsContent value="dashboard">
          <TeamDashboard onOpen={setOpen} />
        </TabsContent>
        <TabsContent value="planning">
          <TeamPlanning tasks={tasks} />
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
