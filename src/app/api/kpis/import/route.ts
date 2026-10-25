import { badRequest, handler, requireUser } from "@/server/http";
import { importKpiRegister } from "@/server/services/kpi-sheet";

/** A multipart form: the register as an Excel file, and `apply` to load it rather than only check it. */
export const POST = handler(async (req) => {
  const user = await requireUser("settings");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("fileEmpty");
  return importKpiRegister({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, form.get("apply") === "1", user);
});
