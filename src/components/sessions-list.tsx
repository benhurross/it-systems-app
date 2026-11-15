"use client";

import { LogOut, Monitor, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { api } from "@/lib/api";

export type SignIn = { id: string; browser: string | null; system: string | null; ipAddress: string | null; createdAt: string; lastActiveAt: string; current: boolean };

/**
 * Where an account is signed in: each browser, its computer, its address and when it was last
 * used. One's own: each can be signed out, or all but this one. An account's, for an admin: all of
 * them at once.
 */
export function SessionsList({ userId }: { userId?: string }) {
  const t = useTranslations("sessions");
  const format = useFormat();
  const path = userId ? `/settings/users/${userId}/sessions` : "/me/sessions";
  const { data: list } = useApi<SignIn[]>(path);
  const endOne = useApiMutation((id: string) => api(`/me/sessions/${id}`, { method: "DELETE" }), { success: t("ended") });
  const endOthers = useApiMutation(() => api<{ ended: number }>("/me/sessions/others", { method: "POST", body: {} }), { success: t("endedOthers") });
  const endAll = useApiMutation(() => api<{ ended: number }>(path, { method: "DELETE" }), { success: t("endedAll") });

  if (!list) return <Skeleton className="h-24 w-full" />;
  const others = list.filter((s) => !s.current);
  return (
    <div className="space-y-3" data-sessions>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.map((s) => {
            const Icon = s.system === "iPhone" || s.system === "Android" ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 p-3 text-sm" data-session={s.current ? "current" : "other"}>
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {[s.browser ?? t("unknownBrowser"), s.system].filter(Boolean).join(t("on"))}
                    {s.current && <StatusBadge tone="success">{t("thisOne")}</StatusBadge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[s.ipAddress, t("lastActive", { when: format.relative(s.lastActiveAt) }), t("since", { date: format.date(s.createdAt) })].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!userId && !s.current && (
                  <Button variant="ghost" size="sm" onClick={() => endOne.mutate(s.id)} disabled={endOne.isPending}>
                    {t("signOut")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!userId && others.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => endOthers.mutate()} disabled={endOthers.isPending}>
          <LogOut />
          {t("signOutOthers")}
        </Button>
      )}
      {userId && list.length > 0 && (
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => endAll.mutate()} disabled={endAll.isPending}>
          <LogOut />
          {t("signOutAll")}
        </Button>
      )}
    </div>
  );
}
