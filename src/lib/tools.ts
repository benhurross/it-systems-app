/**
 * Tools staff use for everyday work, in the app so documents never go to outside websites. Each
 * runs in the person's own browser: files are not uploaded.
 */
export const TOOLS = [
  { key: "pdf_merge", path: "/tools/pdf-merge" },
  { key: "pdf_split", path: "/tools/pdf-split" },
  { key: "pdf_organize", path: "/tools/pdf-organize" },
  { key: "images_to_pdf", path: "/tools/images-to-pdf" },
  { key: "pdf_stamp", path: "/tools/pdf-stamp" },
] as const;
export const TOOL_KEYS = TOOLS.map((t) => t.key) as [ToolKey, ...ToolKey[]];
export type ToolKey = (typeof TOOLS)[number]["key"];

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

export const toolByPath = (path: string) => TOOLS.find((t) => t.path === path);
