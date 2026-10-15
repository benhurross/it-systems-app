import { assetTagsInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { printTags, tagSetup } from "@/server/services/asset-tags";

/** What the Tags page needs to know: whether there is a label printer, and the label's size. */
export const GET = handler(async () => {
  await requireUser("it");
  return tagSetup();
});

/** Asset tags: sent to the label printer, or a PDF or ZPL file of them. */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const output = await printTags(await body(req, assetTagsInput), new URL(req.url).origin, user);
  if (output.kind === "printed") return { printed: output.count };
  return new Response(new Uint8Array(output.bytes), {
    headers: {
      "Content-Type": output.type,
      "Content-Length": String(output.bytes.length),
      "Content-Disposition": `${output.inline ? "inline" : "attachment"}; filename="${output.name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
