import { z } from "zod";
import { isoDate } from "@/lib/dates";
import { dailyCheckInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { dailyChecklist, dailyHistory, recordDailyCheck } from "@/server/services/daily-checks";

export const GET = handler(async (req) => {
  await requireUser("it");
  const date = z.iso.date().parse(new URL(req.url).searchParams.get("date") ?? isoDate());
  const [items, history] = await Promise.all([dailyChecklist(date), dailyHistory()]);
  return { date, items, history };
});

export const PUT = handler(async (req) => {
  const user = await requireUser("it");
  return recordDailyCheck(await body(req, dailyCheckInput), user);
});
