"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { isBreached } from "@/lib/sla";
import type { TicketStatus } from "@/lib/domain";
import { StatusBadge, type Tone } from "./status-badge";

/** The colour each fixed value wears, everywhere it appears. Labels come from `enums` in the messages. */
const TONES = {
  ticketType: { incident: "danger", request: "brand" },
  ticketStatus: { open: "brand", in_progress: "info", on_hold: "warning", resolved: "success", closed: "neutral" },
  priority: { low: "neutral", medium: "info", high: "warning", critical: "danger" },
  kbStatus: { draft: "warning", published: "success", retired: "neutral" },
  changeStatus: { requested: "warning", approved: "brand", rejected: "neutral", implemented: "success" },
  changeResult: { successful: "success", rolled_back: "warning", failed: "danger" },
  changeRisk: { low: "neutral", medium: "warning", high: "danger" },
  assetStatus: { in_use: "success", in_stock: "brand", in_repair: "warning", retired: "neutral" },
  supportStatus: { supported: "success", ending_soon: "warning", end_of_support: "danger", end_of_life: "danger", unknown: "neutral" },
  criticality: { low: "neutral", medium: "info", high: "warning", critical: "danger" },
  deviceStatus: { up: "success", degraded: "warning", down: "danger", unknown: "neutral" },
  alertStatus: { open: "danger", acknowledged: "warning", resolved: "success" },
  licenseState: { compliant: "success", expiring: "warning", expired: "danger", over_deployed: "danger" },
  contractState: { active: "success", expiring: "warning", expired: "danger" },
  purchaseStatus: { requested: "warning", approved: "brand", rejected: "neutral", ordered: "info", received: "success" },
  projectStatus: { planned: "neutral", active: "brand", on_hold: "warning", completed: "success" },
  taskStatus: { todo: "neutral", in_progress: "info", done: "success" },
  riskStatus: { open: "danger", mitigating: "warning", accepted: "neutral", closed: "success" },
  vulnStatus: { open: "danger", in_progress: "warning", resolved: "success", accepted: "neutral" },
  severity: { low: "neutral", medium: "info", high: "warning", critical: "danger" },
  leaverState: { forwarding: "info", due: "danger", completed: "success" },
  rag: { green: "success", amber: "warning", red: "danger", none: "neutral" },
} satisfies Record<string, Record<string, Tone>>;

type Kind = keyof typeof TONES;

export function EnumBadge<K extends Kind>({ kind, value }: { kind: K; value: keyof (typeof TONES)[K] & string }) {
  const t = useTranslations("enums");
  const tones = TONES[kind] as Record<string, Tone>;
  return <StatusBadge tone={tones[value]}>{t(`${kind}.${value}` as "ticketType.incident")}</StatusBadge>;
}

/** Time left, time overdue, or whether the SLA was met once resolved. */
export function SlaIndicator({
  ticket,
}: {
  ticket: { status: TicketStatus; createdAt: string; dueAt: string; resolvedAt: string | null };
}) {
  const t = useTranslations("tickets");
  const format = useFormat();
  const breached = isBreached(ticket);
  if (ticket.resolvedAt) {
    return <StatusBadge tone={breached ? "danger" : "success"}>{t(breached ? "slaBreached" : "slaMet")}</StatusBadge>;
  }
  return (
    <StatusBadge tone={breached ? "danger" : "info"}>
      {breached ? t("overdue", { time: format.relative(ticket.dueAt) }) : t("dueIn", { time: format.relative(ticket.dueAt) })}
    </StatusBadge>
  );
}
