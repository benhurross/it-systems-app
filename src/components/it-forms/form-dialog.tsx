"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent } from "react";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { ComboboxField } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { assetSpecs, CPU_LIST, driveSize } from "@/lib/asset-specs";
import type { Asset, Employee, ItFormRecord } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import {
  CARTRIDGES,
  CREDENTIAL_ITEMS,
  emptyFormData,
  EQUIPMENT,
  FOLDER_PERMISSIONS,
  gridKey,
  itFormInput,
  LEVELS,
  MAINTENANCE_TASKS,
  OASIS,
  OASIS_REQUEST_TYPES,
  privilegeKey,
  REQUEST_REASONS,
  TASK_STATES,
  TONERS,
  type ItFormKind,
} from "@/lib/it-forms";
import { Choice, FormSection, Grid, Line, SubHeading, Ticks } from "./fields";
import { LABELS } from "./labels";

// The form's values: the data's paths are checked by its schema, so they are typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values = { kind: ItFormKind; employeeId: number | null; assetId: number | null; data: any };

/** A new form of a kind, or a correction of one saved; saved, it opens to print. */
export function ItFormDialog({ kind, record, employeeId, onClose }: { kind: ItFormKind; record?: ItFormRecord; employeeId?: number; onClose: () => void }) {
  const t = useTranslations("itForms");
  const router = useRouter();
  const { data: start } = useApi<Record<string, string>>(record ? null : `/it-forms/start?kind=${kind}`);
  const form = useForm<Values>({
    resolver: zodResolver(itFormInput) as never,
    values: record
      ? { kind, employeeId: record.employeeId, assetId: record.assetId, data: record.data }
      : start
        ? { kind, employeeId: employeeId ?? null, assetId: null, data: { ...emptyFormData(kind), ...start, ...today(kind) } }
        : undefined,
  });
  const save = useApiMutation(
    (values: Values) => (record ? api<{ id: number }>(`/it-forms/${record.id}`, { method: "PUT", body: values }) : api<{ id: number }>("/it-forms", { body: values })),
    {
      success: t("saved"),
      onSuccess: (saved) => {
        onClose();
        if (!record) router.push(`/it-forms/${saved.id}`);
      },
    },
  );
  const ready = !!record || !!start;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{record ? t("editTitle", { form: t(`kinds.${kind}`) }) : t(`kinds.${kind}`)}</DialogTitle>
        </DialogHeader>
        {ready && (
          <FormProvider {...form}>
            <form id="it-form" onSubmit={form.handleSubmit((v) => save.mutate(v))} className="-mx-1 max-h-[70vh] space-y-4 overflow-y-auto px-1 py-1">
              <PersonFields kind={kind} />
              {kind === "incident_repair" && <IncidentRepairFields />}
              {kind === "it_request" && <ItRequestFields />}
              {kind === "credentials" && <CredentialsFields />}
              {kind === "maintenance" && <MaintenanceFields />}
            </form>
          </FormProvider>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="it-form" disabled={!ready || save.isPending}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The day's date, where the form has one to fill. */
function today(kind: ItFormKind) {
  const date = isoDate(new Date());
  return kind === "incident_repair" ? { dateReported: date } : kind === "maintenance" ? { date } : {};
}

/** The employee, chosen from the directory to fill in their details, which can then be corrected. */
function PersonFields({ kind }: { kind: ItFormKind }) {
  const t = useTranslations("itForms");
  const lookups = useLookups();
  const { data: employees = [] } = useApi<Employee[]>("/employees");
  const { control, setValue, getValues } = useFormContext<Values>();
  const employeeId = useWatch({ control, name: "employeeId" });

  const fill = useEffectEvent((id: number | null) => {
    const e = employees.find((x) => x.id === id);
    if (!e) return;
    const person = {
      name: e.name,
      empId: e.employeeNumber ?? "",
      department: lookups.label("department", e.department),
      branch: lookups.label("location", e.location),
      jobTitle: e.jobTitle,
      email: e.email,
      mobile: e.mobile ?? "",
    };
    // Filled from the directory only where the form is still blank or showed someone else.
    if (getValues("data.person.name") !== person.name || !getValues("data.person.email")) setValue("data.person", person, { shouldDirty: true });
    if (kind === "credentials" && !getValues("data.emailId")) setValue("data.emailId", e.email, { shouldDirty: true });
  });
  useEffect(() => fill(employeeId), [employeeId, employees.length, lookups.ready]);

  return (
    <FormSection title={kind === "maintenance" || kind === "credentials" ? "Employee Information" : "User Information"}>
      <ComboboxField name="employeeId" label={t("employee")} description={t("employeeHint")} options={employees.map((e) => ({ value: e.id, label: e.name }))} optional />
      <Grid>
        <Line path="person.name" label="Employee Name" />
        <Line path="person.empId" label={kind === "credentials" ? "ID No." : "Emp. ID"} dir="ltr" />
        <Line path="person.department" label="Department" />
        {kind !== "maintenance" && <Line path="person.branch" label="Branch" />}
        <Line path="person.jobTitle" label={kind === "maintenance" ? "Position" : "Job Title"} />
        {kind !== "maintenance" && <Line path="person.email" label="Email" type="email" dir="ltr" />}
        {kind === "it_request" && <Line path="person.mobile" label="Mobile" type="tel" dir="ltr" />}
        {kind === "incident_repair" && <Line path="dateReported" label="Date Reported" type="date" />}
        {kind === "maintenance" && <Line path="date" label="Maintenance Date" type="date" />}
      </Grid>
    </FormSection>
  );
}

/** The computer, chosen from the inventory to fill in its details. */
function AssetPicker({ onPick }: { onPick: (asset: Asset) => void }) {
  const t = useTranslations("itForms");
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const { control } = useFormContext<Values>();
  const assetId = useWatch({ control, name: "assetId" });
  const picked = useEffectEvent((id: number | null) => {
    const a = assets.find((x) => x.id === id);
    if (a) onPick(a);
  });
  useEffect(() => picked(assetId), [assetId, assets.length]);
  return (
    <ComboboxField name="assetId" label={t("asset")} description={t("assetHint")} options={assets.filter((a) => a.status !== "retired").map((a) => ({ value: a.id, label: a.name }))} optional />
  );
}

const levels = LEVELS.map((l) => ({ value: l, label: LABELS.level[l] }));

function IncidentRepairFields() {
  const lookups = useLookups();
  const { setValue, getValues } = useFormContext<Values>();
  const fillAsset = (a: Asset) => {
    const set = (key: string, value: string) => !getValues(`data.repair.${key}`) && setValue(`data.repair.${key}`, value, { shouldDirty: true });
    set("category", lookups.label("asset_type", a.type));
    set("brand", lookups.label("manufacturer", a.manufacturer));
    set("model", a.model ?? "");
    set("serial", a.serial ?? "");
    // The hardware recorded for it: first drive, memory, processor, screen.
    const specs = assetSpecs.parse(a.specs ?? {});
    const drive = specs.drives[0];
    if (drive?.type) set("diskType", drive.type === "hdd" ? "HDD" : "SSD");
    if (drive?.size) set("diskSize", driveSize(drive));
    if (specs.ramGb) set("ram", `${specs.ramGb} GB`);
    const cpu = [specs.cpuBrand && specs.cpuFamily ? lookups.label(CPU_LIST[specs.cpuBrand], specs.cpuFamily) : "", specs.cpuModel].filter(Boolean).join(" ");
    if (cpu) set("processor", cpu);
    if (specs.screenInches) set("screen", `${specs.screenInches}"`);
  };
  return (
    <>
      <FormSection title="Incident Report" toggle="incident.on">
        <Choice path="incident.severity" legend="Severity Level:" options={levels} />
        <Grid>
          <Line path="incident.description" label="Incident Description" wide area />
          <Line path="incident.diagnosis" label="Diagnosis" wide area />
          <Line path="incident.resolution" label="Resolution" wide area />
        </Grid>
      </FormSection>
      <FormSection title="Repair Report" toggle="repair.on">
        <Choice path="repair.severity" legend="Damage Severity Level:" options={levels} />
        <SubHeading>Asset Details</SubHeading>
        <AssetPicker onPick={fillAsset} />
        <Grid>
          <Line path="repair.category" label="Category" />
          <Line path="repair.brand" label="Brand Name" />
          <Line path="repair.model" label="Model" />
          <Line path="repair.serial" label="S/N" dir="ltr" />
        </Grid>
        <SubHeading>For Desktop / Laptop</SubHeading>
        <Grid>
          <Line path="repair.diskType" label="Disk Type" />
          <Line path="repair.diskSize" label="Size" />
          <Line path="repair.ram" label="RAM" />
          <Line path="repair.processor" label="Processor" />
          <Line path="repair.screen" label="Screen" />
          <Line path="repair.others" label="Others" wide />
          <Line path="repair.diagnosis" label="Diagnosis" wide area />
          <Line path="repair.resolution" label="Resolution" wide area />
        </Grid>
      </FormSection>
      <Line path="remarks" label="Remarks" wide area />
    </>
  );
}

function ItRequestFields() {
  return (
    <>
      <FormSection title="IT Request" toggle="it.on">
        <SubHeading>Equipment Request and Custody</SubHeading>
        <Ticks path="it.equipment" options={EQUIPMENT.map((v) => ({ value: v, label: LABELS.equipment[v] }))} />
        <Grid>
          <Line path="it.notesComputer" label="Notes (Desktop / Laptop)" />
          <Line path="it.notesMonitor" label="Notes (LCD Monitor)" />
          <Line path="it.notesPhone" label="Notes (IP Phone / Printer)" />
          <Line path="it.notesSim" label="Notes (Sim Card)" />
          <Line path="it.others" label="Others" wide />
        </Grid>
        <SubHeading>Consumables</SubHeading>
        <div className="grid gap-3 sm:grid-cols-2">
          <Ticks path="it.cartridges" legend="Printer Cartridges" columns={2} options={CARTRIDGES.map((v) => ({ value: v, label: LABELS.colour[v] }))} />
          <Ticks path="it.toners" legend="Printer Toner" options={TONERS.map((v) => ({ value: v, label: LABELS.colour[v] }))} />
        </div>
        <SubHeading>Reason for Request</SubHeading>
        <Ticks path="it.reasons" options={REQUEST_REASONS.map((v) => ({ value: v, label: LABELS.reason[v] }))} />
        <SubHeading>Shared Folder Access</SubHeading>
        {[0, 1].map((i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <Line path={`it.folders.${i}.names`} label="Folder Name/s" />
            <Choice path={`it.folders.${i}.permission`} legend="Permissions:" options={FOLDER_PERMISSIONS.map((v) => ({ value: v, label: LABELS.permission[v] }))} />
          </div>
        ))}
      </FormSection>
      <FormSection title="OASIS Access Request" toggle="oasis.on">
        <Choice path="oasis.user" legend="User:" options={[{ value: "new", label: "New" }, { value: "existing", label: "Existing User" }]} />
        <Grid>
          <Line path="oasis.oasisId" label="Oasis ID" dir="ltr" />
          <Line path="oasis.reason" label="Reason for request" wide />
        </Grid>
        <Ticks path="oasis.requestType" legend="Request Type (for existing users)" options={OASIS_REQUEST_TYPES.map((v) => ({ value: v, label: LABELS.requestType[v] }))} />
        <Privileges />
      </FormSection>
    </>
  );
}

/** The OASIS privileges, section by section: a module whole, or what is named under it. */
function Privileges() {
  const { control } = useFormContext<Values>();
  return (
    <Controller
      control={control}
      name="data.oasis.privileges"
      render={({ field }) => {
        const chosen = new Set<string>(field.value ?? []);
        const toggle = (key: string, on: boolean) => {
          const next = new Set(chosen);
          if (on) next.add(key);
          else next.delete(key);
          field.onChange([...next]);
        };
        const box = (key: string, label: string, strong?: boolean) => (
          <span key={key} className="inline-flex items-center gap-2">
            <Checkbox id={`priv-${key}`} checked={chosen.has(key)} onCheckedChange={(v) => toggle(key, v === true)} />
            <Label htmlFor={`priv-${key}`} className={strong ? "text-sm font-semibold" : "text-sm font-normal"}>
              {label}
            </Label>
          </span>
        );
        return (
          <div className="space-y-3">
            {OASIS.map((s) => (
              <fieldset key={s.key} className="space-y-2">
                <legend className="w-full rounded bg-muted px-2 py-1 text-xs font-semibold uppercase">{s.label}</legend>
                {s.modules.map((m) => (
                  <div key={m.key} className="grid gap-2 border-b pb-2 last:border-0 sm:grid-cols-[14rem_1fr]">
                    {box(privilegeKey(s.key, m.key), m.label, true)}
                    <div className="space-y-2">
                      {m.items.length > 0 && <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">{m.items.map((i) => box(privilegeKey(s.key, m.key, i.key), i.label))}</div>}
                      {m.grids?.map((g) => (
                        <table key={g.key} className="text-sm">
                          <tbody>
                            {g.rows.map((r) => (
                              <tr key={r}>
                                <th scope="row" className="pe-4 text-start font-normal text-muted-foreground">
                                  {r}
                                </th>
                                {g.cols.map((c) => (
                                  <td key={c} className="pe-4 py-0.5">
                                    {box(gridKey(s.key, m.key, g.key, r, c), `${c}`)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ))}
                      {m.after && <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">{m.after.map((i) => box(privilegeKey(s.key, m.key, i.key), i.label))}</div>}
                    </div>
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        );
      }}
    />
  );
}

function CredentialsFields() {
  return (
    <>
      <FormSection title="User Credentials">
        <Grid>
          <Line path="emailId" label="Email ID" dir="ltr" />
          <Line path="oasisId" label="Oasis ID" dir="ltr" />
        </Grid>
      </FormSection>
      <FormSection title="Important Links">
        <Grid>
          <Line path="outlookUrl" label="Outlook Webapp" type="url" dir="ltr" />
          <Line path="ticketingUrl" label="Ticketing System" type="url" dir="ltr" />
        </Grid>
      </FormSection>
      <FormSection title="Item Checklist">
        <Ticks path="items" options={CREDENTIAL_ITEMS.map((v) => ({ value: v, label: LABELS.credentialItem[v] }))} />
        <Line path="others" label="Others" wide />
      </FormSection>
      <Grid>
        <Line path="signedBy" label="IT Manager (name under the signature)" />
      </Grid>
    </>
  );
}

function MaintenanceFields() {
  const lookups = useLookups();
  const { setValue, getValues } = useFormContext<Values>();
  const fillAsset = (a: Asset) => {
    if (!getValues("data.assetType")) setValue("data.assetType", a.type === "laptop" ? "laptop" : "pc", { shouldDirty: true });
    if (!getValues("data.manufacturer")) setValue("data.manufacturer", lookups.label("manufacturer", a.manufacturer), { shouldDirty: true });
  };
  const { control } = useFormContext<Values>();
  return (
    <>
      <FormSection title="Asset Type">
        <AssetPicker onPick={fillAsset} />
        <div className="grid items-end gap-3 sm:grid-cols-2">
          <Choice path="assetType" legend="Asset Type:" options={[{ value: "laptop", label: "Laptop" }, { value: "pc", label: "PC" }]} />
          <Line path="manufacturer" label="Manufacturer" />
        </div>
      </FormSection>
      <FormSection title="Tasks / Status">
        <Controller
          control={control}
          name="data.tasks"
          render={({ field }) => {
            const states = (field.value as string[]) ?? [];
            const setAll = (s: string) => field.onChange(MAINTENANCE_TASKS.map(() => s));
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAll("done")}>
                    All done without issue
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAll("")}>
                    Clear all
                  </Button>
                </div>
                <ol className="divide-y rounded-lg border">
                  {MAINTENANCE_TASKS.map((task, i) => (
                    <li key={task} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-2 text-sm">
                      <span id={`task-${i}`} className="min-w-0 flex-1 basis-64">
                        {i + 1}. {task}
                      </span>
                      <div role="radiogroup" aria-labelledby={`task-${i}`} className="flex gap-3">
                        {TASK_STATES.map((s) => (
                          <label key={s} className="inline-flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`task-${i}`}
                              checked={states[i] === s}
                              onChange={() => field.onChange(states.map((v, j) => (j === i ? s : v)))}
                              className="size-4 accent-primary"
                            />
                            {LABELS.taskState[s]}
                          </label>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            );
          }}
        />
      </FormSection>
      <Grid>
        <Line path="issues" label="List of Issues found" wide area />
        <Line path="checkedBy" label="Checked By" />
        <Line path="checkedDate" label="Date" type="date" />
      </Grid>
    </>
  );
}
