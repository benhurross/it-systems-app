"use client";

import { useEffect, type ReactNode } from "react";
import { StatusPage } from "@/components/status-page";
import { usePathname, useRouter } from "@/i18n/navigation";
import { homeFor } from "@/lib/nav";
import { can, type Area } from "@/lib/permissions";
import { useCurrentUser } from "./current-user";

/**
 * Shows a 403 page to roles outside `area`. The API enforces the same rule on every call;
 * this only spares people a page of failed requests. Employees opening "/" go to their requests.
 */
export function AreaGuard({ area, children }: { area: Area; children: ReactNode }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = can(user.role, area);
  const home = homeFor(user.role);
  const redirectHome = !allowed && pathname === "/" && home !== "/";

  useEffect(() => {
    if (redirectHome) router.replace(home);
  }, [redirectHome, home, router]);

  if (allowed) return children;
  if (redirectHome) return null;
  return <StatusPage kind="forbidden" home={home} />;
}
