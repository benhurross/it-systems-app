import { dashboardSummary } from "@/lib/dashboard";
import { db } from "../db";
import { assets, risks, tickets, vulnerabilities } from "../db/schema";
import { budgetSummary, listContracts } from "./finance";
import { listLicenses } from "./licenses";
import { networkStatus } from "./monitoring";
import { listLeavers } from "./people";

/** Everything the dashboard shows, worked out from the current records. */
export async function dashboard(now = new Date()) {
  const [ticketRows, assetRows, network, licenses, contracts, budget, riskRows, vulnerabilityRows, leavers] = await Promise.all([
    db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        issueType: tickets.issueType,
        createdAt: tickets.createdAt,
        dueAt: tickets.dueAt,
        resolvedAt: tickets.resolvedAt,
        closedAt: tickets.closedAt,
      })
      .from(tickets),
    db
      .select({
        id: assets.id,
        name: assets.name,
        category: assets.category,
        status: assets.status,
        purchaseDate: assets.purchaseDate,
        warrantyEnd: assets.warrantyEnd,
        supportStatus: assets.supportStatus,
        monitorStatus: assets.monitorStatus,
      })
      .from(assets),
    networkStatus(now),
    listLicenses(),
    listContracts(),
    budgetSummary(),
    db.select({ likelihood: risks.likelihood, impact: risks.impact, status: risks.status }).from(risks),
    db
      .select({ id: vulnerabilities.id, title: vulnerabilities.title, status: vulnerabilities.status, deadline: vulnerabilities.deadline })
      .from(vulnerabilities),
    listLeavers(),
  ]);
  return dashboardSummary(
    {
      tickets: ticketRows,
      assets: assetRows,
      availability: network.devices.map((d) => d.availability),
      licenses,
      contracts,
      budget,
      risks: riskRows,
      vulnerabilities: vulnerabilityRows,
      leavers,
    },
    now,
  );
}
