"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { DateField, FormDialog, SelectField, TextareaField, TextField } from "@/components/form";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Project, ProjectDetail, Staff } from "@/lib/api-types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/domain";
import { projectInput, taskInput } from "@/lib/schemas";

type Task = ProjectDetail["tasks"][number];

function useStaffOptions() {
  const { data: staff = [] } = useApi<Staff[]>("/staff");
  return staff.map((s) => ({ value: s.id, label: s.name }));
}

/** Starts a project, or edits `project`. */
export function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const staff = useStaffOptions();
  const form = useForm<z.input<typeof projectInput>, unknown, z.output<typeof projectInput>>({
    resolver: zodResolver(projectInput),
    defaultValues: project ?? { name: "", status: "planned", ownerId: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof projectInput>) =>
      project
        ? api<{ id: number }>(`/projects/${project.id}`, { method: "PATCH", body: values })
        : api<{ id: number }>("/projects", { body: values }),
    {
      form,
      success: t("projects.saved"),
      onSuccess: (saved) => {
        onClose();
        if (!project) router.push(`/projects/${saved.id}`);
      },
    },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={project ? t("projects.edit") : t("projects.new")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
      wide
    >
      <TextField name="name" label={t("projects.name")} />
      <TextareaField name="description" label={t("projects.description")} rows={3} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="ownerId" label={t("projects.owner")} options={staff} optional />
        <SelectField
          name="status"
          label={t("projects.status")}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: t(`enums.projectStatus.${s}`) }))}
        />
        <DateField name="startDate" label={t("projects.start")} optional />
        <DateField name="dueDate" label={t("projects.due")} optional />
      </div>
    </FormDialog>
  );
}

/** The fields a task is saved with; the board sends them back with a new status. */
export const toTaskInput = (task: Task): z.input<typeof taskInput> => ({
  title: task.title,
  assigneeId: task.assigneeId,
  status: task.status,
  dueDate: task.dueDate,
});

/** Adds a task to the project's To do column, or edits `task`. */
export function TaskDialog({ projectId, task, onClose }: { projectId: number; task?: Task; onClose: () => void }) {
  const t = useTranslations();
  const staff = useStaffOptions();
  const form = useForm<z.input<typeof taskInput>, unknown, z.output<typeof taskInput>>({
    resolver: zodResolver(taskInput),
    defaultValues: task ? toTaskInput(task) : { title: "", status: "todo", assigneeId: null },
  });
  const save = useApiMutation(
    (values: z.output<typeof taskInput>) =>
      task
        ? api(`/tasks/${task.id}`, { method: "PATCH", body: values })
        : api(`/projects/${projectId}/tasks`, { body: values }),
    { form, success: t("projects.taskSaved"), onSuccess: onClose },
  );

  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={task ? task.title : t("projects.addTask")}
      form={form}
      onSubmit={(values) => save.mutate(values)}
      pending={save.isPending}
    >
      <TextField name="title" label={t("projects.task")} />
      <SelectField name="assigneeId" label={t("projects.assignee")} options={staff} optional />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="status"
          label={t("projects.status")}
          options={TASK_STATUSES.map((s) => ({ value: s, label: t(`enums.taskStatus.${s}`) }))}
        />
        <DateField name="dueDate" label={t("projects.due")} optional />
      </div>
    </FormDialog>
  );
}
