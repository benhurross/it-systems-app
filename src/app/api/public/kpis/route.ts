import { handler, yearParam } from "@/server/http";
import { apiTokenOf } from "@/server/services/api-tokens";
import { kpiRegister } from "@/server/services/kpis";
import { getSetting } from "@/server/settings";

/**
 * The KPIs for other systems, such as the dashboard the GM, DGM and Board look at:
 *   GET /api/public/kpis?year=2026   with   Authorization: Bearer <API key from Settings → API access>
 * Read only. Shares are fractions (0.95 for 95%); figures are by month (1–12) or quarter (1–4).
 */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization", "access-control-allow-methods": "GET, OPTIONS" };

export const OPTIONS = async () => new Response(null, { status: 204, headers: CORS });

export const GET = handler(async (req) => {
  if (!(await apiTokenOf(req))) {
    return Response.json({ error: "A valid API key is needed: Authorization: Bearer <key>" }, { status: 401, headers: { ...CORS, "www-authenticate": "Bearer" } });
  }
  const year = yearParam(req);
  const [{ rows, roles }, organisation] = await Promise.all([kpiRegister(year), getSetting("organisation")]);
  const body = {
    organisation: organisation.name,
    year,
    generatedAt: new Date().toISOString(),
    kpis: rows
      .filter((r) => r.active)
      .map((r) => ({
        code: r.code,
        name: r.name,
        nameAr: r.nameAr || null,
        level: r.level,
        department: r.department,
        role: r.role,
        owner: r.ownerName,
        reviewer: r.reviewer,
        frequency: r.frequency,
        period: r.period,
        unit: r.unit,
        higherIsBetter: r.higherIsBetter,
        targetFor: r.targetFor,
        baseline: r.settings.baseline,
        target: r.settings.target,
        weight: r.settings.weight,
        figures: r.cells.filter((c) => c.value !== null).map((c) => ({ period: c.period, value: c.value, numerator: c.numerator, denominator: c.denominator, source: c.from, note: c.note || null })),
        yearToDate: r.year,
        judged: r.judged,
        status: r.status,
        achievement: r.achievement,
      })),
    roles: roles.map((r) => ({ role: r.role, level: r.level, score: r.score, weightWithFigures: r.weighted, weightSet: r.total })),
  };
  return Response.json(body, { headers: { ...CORS, "cache-control": "no-store" } });
});
