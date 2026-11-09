import { handler, requireUser } from "@/server/http";
import { assetTemplate } from "@/server/services/asset-template";

/** The workbook to fill in the inventory with, its Lists sheet from the app's lists as they stand. */
export const GET = handler(async () => {
  await requireUser("it");
  const bytes = await assetTemplate();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="asset-import-template.xlsx"',
    },
  });
});
