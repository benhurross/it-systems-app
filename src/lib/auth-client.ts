import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/server/auth";
import { ac, authRoles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: authRoles }), inferAdditionalFields<typeof auth>()],
});
