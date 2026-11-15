import { z } from "zod";

/**
 * How signing in behaves: one sign-in at a time per account (a new one ends the others), and how
 * long without activity before an account is signed out (0: never).
 */
export const IDLE_CHOICES = [0, 5, 10, 15, 30, 60] as const;

export const securitySettings = z.object({
  singleSession: z.boolean().default(true),
  idleMinutes: z.literal(IDLE_CHOICES).default(5),
});
export type SecuritySettings = z.output<typeof securitySettings>;
export const DEFAULT_SECURITY: SecuritySettings = { singleSession: true, idleMinutes: 5 };

/** "Edge on Windows", "Safari on iPhone": a browser's own description, read for people. */
export function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const system = /Windows/.test(ua)
    ? "Windows"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /iPad/.test(ua)
        ? "iPad"
        : /Android/.test(ua)
          ? "Android"
          : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return { browser, system };
}
