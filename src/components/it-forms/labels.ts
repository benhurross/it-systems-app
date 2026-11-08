import type { CARTRIDGES, CREDENTIAL_ITEMS, EQUIPMENT, FOLDER_PERMISSIONS, LEVELS, OASIS_REQUEST_TYPES, REQUEST_REASONS, TASK_STATES, TONERS } from "@/lib/it-forms";

/** The paper forms' own wording for each choice, the same on the form in the app and on the sheet. */
export const LABELS = {
  level: { low: "Low", medium: "Medium", high: "High" } satisfies Record<(typeof LEVELS)[number], string>,
  equipment: {
    desktop: "Desktop",
    laptop: "Laptop",
    lcdMonitor: "LCD Monitor",
    doorAccess: "Door Access",
    ipPhone: "IP Phone",
    printer: "Printer",
    simCard: "Sim Card",
    scanner: "Scanner",
  } satisfies Record<(typeof EQUIPMENT)[number], string>,
  colour: { black: "Black", color: "Color", cyan: "Cyan", magenta: "Magenta", yellow: "Yellow" } satisfies Record<(typeof CARTRIDGES)[number] | (typeof TONERS)[number], string>,
  reason: {
    notIssued: "Not issued yet",
    outdated: "Old / Outdated",
    damaged: "Damaged",
    unrepairable: "Unrepairable",
    lost: "Lost",
    new: "New",
    replenish: "Replenish supply",
  } satisfies Record<(typeof REQUEST_REASONS)[number], string>,
  permission: { full: "Full Access", readWrite: "Read/Write", readOnly: "Read-Only" } satisfies Record<(typeof FOLDER_PERMISSIONS)[number], string>,
  requestType: {
    disablePrivileges: "Disable Existing Privileges",
    addPrivileges: "Add More Privileges",
    disableUser: "Disable User",
    reactivateUser: "Reactivate User",
  } satisfies Record<(typeof OASIS_REQUEST_TYPES)[number], string>,
  credentialItem: { laptop: "Laptop", pc: "PC", idCard: "ID Card", accessCard: "Access Card", screen: "Screen" } satisfies Record<(typeof CREDENTIAL_ITEMS)[number], string>,
  taskState: { done: "Done – without Issue", issue: "Issue Found", na: "Not Applicable" } satisfies Record<(typeof TASK_STATES)[number], string>,
};
