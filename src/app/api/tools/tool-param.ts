import { notFound } from "@/server/http";
import { TOOL_KEYS, type ToolKey } from "@/lib/tools";

/** The `[tool]` segment, when it names a tool; 404 for anything else. */
export async function toolParam(ctx: { params: Promise<{ tool: string }> }): Promise<ToolKey> {
  const { tool } = await ctx.params;
  if (!(TOOL_KEYS as string[]).includes(tool)) throw notFound();
  return tool as ToolKey;
}
