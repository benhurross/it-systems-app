"use client";

import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { EnumBadge } from "@/components/badges";
import { ComboboxField, FormDialog } from "@/components/form";
import { LicenseDialog } from "@/components/software/license-dialog";
import { StatusPage } from "@/components/status-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Asset, LicenseDetail } from "@/lib/api-types";
import { isoDate } from "@/lib/dates";
import { ref } from "@/lib/domain";
import { licenseState } from "@/lib/licenses";

export default function LicensePage({ params }: PageProps<"/[locale]/software/[id]">) {
  const { id } = use(params);
  const t = useTranslations();
  const format = useFormat();
  const lookups = useLookups();
  const [dialog, setDialog] = useState<"edit" | "install" | null>(null);
  const { data: license, isLoading } = useApi<LicenseDetail>(`/licenses/${id}`);
  const uninstall = useApiMutation((assetId: number) => api(`/licenses/${id}/installs/${assetId}`, { method: "DELETE" }));

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!license) return <StatusPage kind="notFound" home="/software" />;

  const state = licenseState(license, license.installs, isoDate());

  return (
    <div className="space-y-6">
      <Link href="/software" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("software.back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">{ref("license", license.id)}</span>
            <EnumBadge kind="licenseState" value={state} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{license.product}</h1>
        </div>
        <Button variant="outline" onClick={() => setDialog("edit")}>
          <Pencil />
          {t("common.edit")}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("tickets.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="@container divide-y text-sm">
              <Row label={t("software.vendor")}>{license.vendorName ?? "—"}</Row>
              <Row label={t("software.version")}>{license.version ?? "—"}</Row>
              <Row label={t("software.type")}>{t(`enums.licenseType.${license.type}`)}</Row>
              <Row label={t("software.seats")}>{format.number(license.seats)}</Row>
              <Row label={t("software.installs")}>{format.number(license.installs)}</Row>
              <Row label={t("software.purchaseDate")}>{license.purchaseDate ? format.date(license.purchaseDate) : "—"}</Row>
              <Row label={t("software.expiry")}>{license.expiryDate ? format.date(license.expiryDate) : t("software.noExpiry")}</Row>
              <Row label={t("software.cost")}>{license.cost !== null ? format.currency(license.cost) : "—"}</Row>
              <Row label={t("software.owner")}>{license.owner ? lookups.label("department", license.owner) : "—"}</Row>
              <Row label={t("software.reference")}>{license.reference ?? "—"}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {t("software.devices")} ({format.number(license.devices.length)})
            </CardTitle>
            <Button size="sm" onClick={() => setDialog("install")}>
              <Plus />
              {t("software.install")}
            </Button>
          </CardHeader>
          <CardContent>
            {license.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("software.noDevices")}</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {license.devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 border-b py-1.5">
                    <Link href={`/assets/${d.assetId}`} className="min-w-0 break-words hover:text-primary">
                      <span className="font-medium">{d.name}</span>
                      {d.assignedName && <span className="text-muted-foreground"> · {d.assignedName}</span>}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t("software.uninstall")}: ${d.name}`}
                      onClick={() => uninstall.mutate(d.assetId)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog === "edit" && <LicenseDialog license={license} onClose={() => setDialog(null)} />}
      {dialog === "install" && <InstallDialog license={license} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 @[16rem]:grid-cols-[9rem_1fr] @[16rem]:gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function InstallDialog({ license, onClose }: { license: LicenseDetail; onClose: () => void }) {
  const t = useTranslations("software");
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const installed = new Set(license.devices.map((d) => d.assetId));
  const form = useForm<{ assetId: number | null }>({ defaultValues: { assetId: null } });
  const install = useApiMutation((assetId: number) => api(`/licenses/${license.id}/installs`, { body: { assetId } }), {
    success: t("installed"),
    onSuccess: onClose,
  });
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("install")}
      form={form}
      onSubmit={({ assetId }) => assetId && install.mutate(assetId)}
      pending={install.isPending}
    >
      <ComboboxField
        name="assetId"
        label={t("device")}
        options={assets
          .filter((a) => a.status !== "retired" && !installed.has(a.id))
          .map((a) => ({ value: a.id, label: `${a.name}${a.assignedName ? ` (${a.assignedName})` : ""}` }))}
      />
    </FormDialog>
  );
}
