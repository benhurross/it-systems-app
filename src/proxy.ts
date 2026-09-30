import { getSessionCookie } from "better-auth/cookies";
import { hasLocale } from "next-intl";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { signInFor } from "./lib/next-path";

const intl = createMiddleware(routing);

/** Pages anyone may open: signing in, and answering a resolved ticket from the link in its email. */
const PUBLIC = ["sign-in", "respond"];

/**
 * Locale routing, plus a redirect to sign-in when there is no session cookie at all.
 * This only checks the cookie is present; every API handler validates the session itself.
 */
export default function proxy(request: NextRequest) {
  const [, first, second] = request.nextUrl.pathname.split("/");
  const locale = hasLocale(routing.locales, first) ? first : null;
  if (!(locale && PUBLIC.includes(second)) && !getSessionCookie(request)) {
    // Come back to the page asked for (a link in an email, say) once signed in.
    const { pathname, search } = request.nextUrl;
    const path = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
    return NextResponse.redirect(new URL(`/${locale ?? routing.defaultLocale}${signInFor(`${path}${search}`)}`, request.url));
  }
  return intl(request);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
