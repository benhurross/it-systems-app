/**
 * Where to go after signing in: a path inside this app, without its locale, carried as ?next=.
 * Anything else (another site, a protocol-relative "//host", a backslash trick) is ignored, so a
 * crafted link can never send someone elsewhere after they sign in.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "http://app.invalid");
    return url.origin === "http://app.invalid" ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

/** The sign-in address that comes back to `path` (without locale) afterwards. */
export function signInFor(path: string): string {
  const next = safeNext(path);
  return next && next !== "/" ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
}
