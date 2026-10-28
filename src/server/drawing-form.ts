import type { Drawing } from "./services/floor-plans";
import { badRequest, formJson } from "./http";

/**
 * A drawing sent as a multipart form: the PDF or SVG as `file`, and as JSON the page's size (`page`), the
 * size of an outlet's mark (`mark`) and the outlets read from it (`outlets`, left out to keep the plan's,
 * then `fit` to move them onto the new drawing).
 */
export async function drawingForm(form: FormData): Promise<Drawing> {
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("fileEmpty");
  const size = (name: string) => {
    const v = formJson(form, name) as { width?: unknown; height?: unknown } | undefined;
    if (typeof v?.width !== "number" || typeof v.height !== "number") throw badRequest(name);
    return { width: v.width, height: v.height };
  };
  const outlets = formJson(form, "outlets");
  const fit = formJson(form, "fit");
  return {
    file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
    page: size("page"),
    mark: size("mark"),
    outlets: outlets === undefined ? null : (outlets as Drawing["outlets"]),
    fit: Array.isArray(fit) ? (fit as number[]) : null,
  };
}
