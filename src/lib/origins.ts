/**
 * Web addresses from settings that may each list several, separated by commas. Spaces and trailing
 * slashes are dropped, because sign-in compares addresses exactly and a stray space refuses everyone.
 */
export function parseOrigins(...settings: (string | undefined)[]): string[] {
  const all = settings
    .flatMap((setting) => (setting ?? "").split(","))
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(all)];
}
