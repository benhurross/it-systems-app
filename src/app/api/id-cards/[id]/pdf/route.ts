import { z } from "zod";
import { CARD_SIDES } from "@/lib/id-card";
import { handler, idParam, requireUser } from "@/server/http";
import { cardPdfFor } from "@/server/services/id-cards";

/** One side of the card as a PDF, opened in the browser to print on the card printer. */
export const GET = handler(async (req, ctx: RouteContext<"/api/id-cards/[id]/pdf">) => {
  await requireUser("it");
  const side = z.enum(CARD_SIDES).parse(new URL(req.url).searchParams.get("side"));
  const pdf = await cardPdfFor(await idParam(ctx), side);
  const file = `ID card - ${pdf.name.replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, "")} (${side}).pdf`;
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
