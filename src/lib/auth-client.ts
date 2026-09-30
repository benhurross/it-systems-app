import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/server/auth";
import { ac, authRoles } from "./permissions";

export const authClient = createAuthClient({
  // The page's own address, so sign-in works from whichever trusted address it was opened at. While
  // prerendering there is no page and the client sends nothing, so any valid address will do; this
  // also keeps the client from reading BETTER_AUTH_URL, which may list several addresses.
  baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin,
  plugins: [adminClient({ ac, roles: authRoles }), inferAdditionalFields<typeof auth>()],
});
