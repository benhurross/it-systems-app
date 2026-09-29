"use client";

import { Radar } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AssetDialog, type AssetInput } from "@/components/assets/asset-dialog";
import { AssetsHeader } from "@/components/assets/assets-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { HostState } from "@/lib/discovery";
import type { Json } from "@/lib/api-types";
import type * as discovery from "@/server/services/discovery";

type Run = Json<Awaited<ReturnType<typeof discovery.getDiscoveryRun>>>;
type RunSummary = Json<Awaited<ReturnType<typeof discovery.listDiscoveryRuns>>>[number];
type Host = Run["hosts"][number];

const STATE_TONE: Record<HostState, Tone> = { registered: "success", new: "warning", ip_changed: "info" };

/** A first guess at what a device is, from the ports it answers on. */
function guess(host: Host): Partial<AssetInput> {
  const base = { name: host.hostname?.split(".")[0] ?? host.ip, ipAddress: host.ip, macAddress: host.mac, location: "jeddah", monitorMethod: "ping" as const };
  if (host.openPorts.includes(9100)) return { ...base, category: "printers", type: "printer" };
  if (host.openPorts.includes(3389)) return { ...base, category: "end_user", type: "desktop" };
  if (host.openPorts.includes(22)) return { ...base, category: "servers", type: "physical_server" };
  return { ...base, category: "network" };
}

export default function DiscoveryPage() {
  const t = useTranslations();
  const format = useFormat();
  const [cidr, setCidr] = useState("");
  const [runId, setRunId] = useState<number | null>(null);
  const [adding, setAdding] = useState<Host | null>(null);
  const { data: runs = [] } = useApi<RunSummary[]>("/discovery");
  const selected = runId ?? runs[0]?.id ?? null;
  const { data: run } = useApi<Run>(selected ? `/discovery/${selected}` : null, {
    refetchInterval: (data) => (data?.status === "running" ? 1500 : false),
  });
  const start = useApiMutation((range: string) => api<{ id: number }>("/discovery", { body: { cidr: range } }), {
    onSuccess: (created) => setRunId(created.id),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cidr.trim()) start.mutate(cidr.trim());
  };

  return (
    <>
      <AssetsHeader />
      <p className="mb-4 max-w-2xl text-muted-foreground">{t("discovery.intro")}</p>
      <form onSubmit={submit} className="mb-6 flex max-w-xl flex-wrap items-end gap-3">
        <Field className="flex-1">
          <FieldLabel htmlFor="cidr">{t("discovery.cidr")}</FieldLabel>
          <Input id="cidr" dir="ltr" placeholder="192.168.1.0/24" value={cidr} onChange={(e) => setCidr(e.target.value)} />
          <FieldDescription>{t("discovery.cidrHint")}</FieldDescription>
        </Field>
        <Button type="submit" className="mb-7" disabled={start.isPending || run?.status === "running"}>
          <Radar />
          {t("discovery.start")}
        </Button>
      </form>

      {!run ? (
        <EmptyState icon={Radar} title={t("discovery.noRuns")} />
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span dir="auto">
                {run.status === "running"
                  ? t("discovery.running", { scanned: format.number(run.scanned), total: format.number(run.total) })
                  : run.status === "failed"
                    ? t("discovery.failed", { error: run.error ?? "" })
                    : t("discovery.done", { found: format.number(run.hosts.length), cidr: run.cidr })}
              </span>
              <span className="text-sm font-normal text-muted-foreground">{format.dateTime(run.startedAt)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {run.status === "running" && <Progress value={(run.scanned / run.total) * 100} className="mb-4" aria-label={t("discovery.cidr")} />}
            {run.hosts.length === 0 ? (
              run.status !== "running" && <p className="text-sm text-muted-foreground">{t("discovery.noHosts")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("discovery.ip")}</TableHead>
                    <TableHead>{t("discovery.hostname")}</TableHead>
                    <TableHead>{t("discovery.mac")}</TableHead>
                    <TableHead>{t("discovery.ports")}</TableHead>
                    <TableHead>{t("discovery.latency")}</TableHead>
                    <TableHead>{t("discovery.state")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("common.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.hosts.map((host) => (
                    <TableRow key={host.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {host.ip}
                      </TableCell>
                      <TableCell>{host.hostname ?? "—"}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {host.mac ?? "—"}
                      </TableCell>
                      <TableCell dir="ltr">{host.openPorts.join(", ") || "—"}</TableCell>
                      <TableCell>{host.latencyMs !== null ? `${format.number(host.latencyMs)} ms` : "—"}</TableCell>
                      <TableCell>
                        <StatusBadge tone={STATE_TONE[host.state]}>{t(`discovery.states.${host.state}`)}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-end">
                        {host.state === "new" ? (
                          <Button size="sm" variant="outline" onClick={() => setAdding(host)}>
                            {t("discovery.add")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/assets/${host.assetId}`}>{t("discovery.view")}</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {runs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("discovery.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setRunId(r.id)}
                    aria-current={r.id === selected ? "true" : undefined}
                    className="flex w-full flex-wrap items-center justify-between gap-2 py-2 text-start hover:text-primary aria-[current]:font-medium"
                  >
                    <span dir="ltr" className="font-mono">
                      {r.cidr}
                    </span>
                    <span className="text-muted-foreground">
                      {t("discovery.foundCount", { found: format.number(r.found ?? 0) })} ·{" "}
                      {r.startedByName && t("discovery.startedBy", { name: r.startedByName })} · {format.dateTime(r.startedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {adding && <AssetDialog initial={guess(adding)} onClose={() => setAdding(null)} />}
    </>
  );
}
