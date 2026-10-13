"use client";

import { useCurrentUser } from "@/components/app-shell/current-user";
import { useApi } from "@/hooks/use-api";
import type { MyTool } from "@/lib/api-types";
import { can } from "@/lib/permissions";

/** Whether the signed-in person may use Presentations: admins always, others once it is open to them. */
export function usePresentationsAccess() {
  const user = useCurrentUser();
  const admin = can(user.role, "settings");
  const { data } = useApi<MyTool[]>("/tools");
  const status = data?.find((x) => x.key === "presentations");
  return { admin, status, ready: admin || !!data, allowed: admin || status?.status === "allowed" };
}
