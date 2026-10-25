import { handler, requireUser, yearParam } from "@/server/http";
import { exportKpiRegister } from "@/server/services/kpi-sheet";

/** The year's register as an Excel workbook, to send to the GM and DGM. */
export const GET = handler(async (req) => {
  await requireUser("it");
  const year = yearParam(req);
  const bytes = await exportKpiRegister(year);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="kpi-register-${year}.xlsx"`,
    },
  });
});
