import { drawingForm } from "@/server/drawing-form";
import { handler, requireUser } from "@/server/http";
import { createPlan, listPlans } from "@/server/services/floor-plans";

export const GET = handler(async () => {
  await requireUser("it");
  return listPlans();
});

/** A multipart form: the plan's `name` and its drawing (see drawingForm). */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const form = await req.formData();
  return createPlan(String(form.get("name") ?? ""), await drawingForm(form), user);
});
