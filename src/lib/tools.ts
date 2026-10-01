/**
 * Tools staff use for everyday work, in the app so documents never go to outside websites. Each
 * runs in the person's own browser: files are not uploaded. Each is switched on, off or put
 * behind approval on its own, even those shown together in the PDF toolkit.
 */
export const TOOL_KEYS = ["pdf_merge", "pdf_split", "pdf_organize", "pdf_to_word", "images_to_pdf", "pdf_stamp"] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

/** The PDF toolkit's modes, each one of the tools. */
export const PDF_MODES = [
  { mode: "merge", tool: "pdf_merge" },
  { mode: "split", tool: "pdf_split" },
  { mode: "organize", tool: "pdf_organize" },
  { mode: "word", tool: "pdf_to_word" },
] as const;
export type PdfMode = (typeof PDF_MODES)[number]["mode"];

/** What the Tools page lists: the PDF toolkit, and the tools that have a page of their own. */
export const TOOL_CARDS = [
  { id: "pdf_kit", path: "/tools/pdf", tools: PDF_MODES.map((m) => m.tool) },
  { id: "images_to_pdf", path: "/tools/images-to-pdf", tools: ["images_to_pdf"] },
  { id: "pdf_stamp", path: "/tools/pdf-stamp", tools: ["pdf_stamp"] },
] as const satisfies readonly { id: string; path: string; tools: readonly ToolKey[] }[];

/** on: everyone may use it; approval: people ask and an admin grants it; off: nobody. */
export const TOOL_MODES = ["on", "approval", "off"] as const;
export type ToolMode = (typeof TOOL_MODES)[number];

/** A person's own exception: allowed whatever the tool's setting, blocked, or asked for. */
export const TOOL_ACCESS_STATES = ["allowed", "blocked", "requested"] as const;
export type ToolAccessState = (typeof TOOL_ACCESS_STATES)[number];

export type ToolSetting = { mode: ToolMode; blockedDepartments: string[] };
export const DEFAULT_TOOL_SETTING: ToolSetting = { mode: "on", blockedDepartments: [] };

/** What a person may do with a tool: use it, ask for it, wait for an answer, or nothing. */
export type ToolStatus = "allowed" | "approval" | "requested" | "blocked" | "off";

/**
 * Off is off for everyone. Otherwise a person's own exception decides, then their department
 * being blocked, then the tool's setting.
 */
export function toolStatus(setting: ToolSetting, department: string | null, exception: ToolAccessState | null): ToolStatus {
  if (setting.mode === "off") return "off";
  if (exception === "blocked") return "blocked";
  if (exception === "allowed") return "allowed";
  if (department && setting.blockedDepartments.includes(department)) return "blocked";
  if (setting.mode === "approval") return exception === "requested" ? "requested" : "approval";
  return "allowed";
}

