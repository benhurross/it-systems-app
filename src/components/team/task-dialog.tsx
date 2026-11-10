"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { DateField, FormDialog, SelectField, SwitchField, TextareaField, TextField } from "@/components/form";
import { DeleteRecord } from "@/components/delete-record";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { Project, TeamAssignee, TeamTask } from "@/lib/api-types";
import { REQUESTERS, TASK_PRIORITIES, teamTaskInput, type TeamTaskInput } from "@/lib/team";

/** A new task, or a change to one: the Admins' own. */
export function TaskDialog({ task, onClose, onSaved }: { task?: TeamTask; onClose: () => void; onSaved?: (id: number) => void }) {
  const t = useTranslations("team");
  const { data: people = [] } = useApi<TeamAssignee[]>("/team/assignees");
  const { data: projects = [] } = useApi<Project[]>("/projects");
  const form = useForm<z.input<typeof teamTaskInput>, unknown, TeamTaskInput>({
    resolver: zodResolver(teamTaskInput),
    defaultValues: task
      ? {
          title: task.title,
          description: task.description,
          assigneeId: task.assigneeId ?? "",
          requester: task.requester,
          requesterName: task.requesterName,
          priority: task.priority,
          dueDate: task.dueDate,
          confidential: task.confidential,
          projectId: task.projectId,
        }
      : { title: "", assigneeId: "", requester: "it_manager", priority: "medium", confidential: false },
  });
  const requester = useWatch({ control: form.control, name: "requester" });
  const save = useApiMutation(
    (values: TeamTaskInput) => (task ? api<TeamTask>(`/team/tasks/${task.id}`, { method: "PUT", body: values }) : api<TeamTask>("/team/tasks", { body: values })),
    {
      form,
      success: t("saved"),
      onSuccess: (saved) => {
        onSaved?.(saved.id);
        onClose();
      },
    },
  );
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={task ? t("editTask") : t("newTask")}
      form={form}
      onSubmit={(v) => save.mutate(v)}
      pending={save.isPending}
      wide
      extra={task && <DeleteRecord path={`/team/tasks/${task.id}`} name={task.title} onDeleted={onClose} labels={{ action: t("deleteTask"), confirm: t("deleteConfirm", { title: task.title }), done: t("deleted") }} />}
    >
      <TextField name="title" label={t("taskTitle")} />
      <TextareaField name="description" label={t("taskDescription")} optional rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="assigneeId" label={t("assignee")} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        <SelectField name="priority" label={t("priority")} options={TASK_PRIORITIES.map((p) => ({ value: p, label: t(`priorities.${p}`) }))} />
        <SelectField name="requester" label={t("requester")} options={REQUESTERS.map((r) => ({ value: r, label: t(`requesters.${r}`) }))} />
        {(requester === "executive" || requester === "other") && <TextField name="requesterName" label={t("requesterName")} description={t("requesterNameHint")} />}
        <DateField name="dueDate" label={t("dueDate")} optional />
        <SelectField name="projectId" label={t("project")} options={projects.map((p) => ({ value: p.id, label: p.name }))} optional />
      </div>
      <SwitchField name="confidential" label={t("confidential")} description={t("confidentialHint")} />
    </FormDialog>
  );
}
