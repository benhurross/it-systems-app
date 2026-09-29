"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnumBadge } from "@/components/badges";
import { columnHelper, DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { TaskProgress } from "@/components/projects/progress-cell";
import { ProjectDialog } from "@/components/projects/project-dialogs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import type { Project } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { PROJECT_STATUSES } from "@/lib/domain";
import { isProjectOverdue, projectProgress } from "@/lib/projects";

const col = columnHelper<Project>();

export default function ProjectsPage() {
  const t = useTranslations();
  const format = useFormat();
  const [adding, setAdding] = useState(false);
  const { data = [], isLoading } = useApi<Project[]>("/projects");
  const today = isoDate();

  const columns = [
    col.accessor("name", {
      header: t("projects.name"),
      cell: (info) => (
        <Link href={`/projects/${info.row.original.id}`} className="font-medium hover:text-primary">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("ownerName", { header: t("projects.owner"), cell: (info) => info.getValue() ?? "—" }),
    col.accessor("status", {
      header: t("projects.status"),
      filterFn: "arrHas",
      cell: (info) => <EnumBadge kind="projectStatus" value={info.getValue()} />,
    }),
    col.accessor("dueDate", {
      header: t("projects.due"),
      cell: (info) =>
        info.getValue() ? (
          <span className="flex flex-wrap items-center gap-2">
            {format.date(info.getValue()!)}
            {isProjectOverdue(info.row.original, today) && <StatusBadge tone="danger">{t("projects.overdue")}</StatusBadge>}
          </span>
        ) : (
          "—"
        ),
    }),
    col.accessor((p) => projectProgress(p.doneCount, p.taskCount), {
      id: "progress",
      header: t("projects.progress"),
      cell: (info) => <TaskProgress done={info.row.original.doneCount} total={info.row.original.taskCount} />,
    }),
  ];

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        description={t("projects.intro")}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("projects.new")}
          </Button>
        }
      />
      <DataTable
        data={data}
        columns={columns}
        loading={isLoading}
        rowHref={(p) => `/projects/${p.id}`}
        facets={[
          {
            column: "status",
            label: t("projects.status"),
            options: PROJECT_STATUSES.map((s) => ({ value: s, label: t(`enums.projectStatus.${s}`) })),
          },
        ]}
      />
      {adding && <ProjectDialog onClose={() => setAdding(false)} />}
    </>
  );
}
