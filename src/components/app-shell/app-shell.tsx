"use client";

import { useLocale } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "./app-sidebar";
import { CurrentUserProvider } from "./current-user";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  if (!session) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 bg-sidebar md:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <CurrentUserProvider value={session.user}>
      <SidebarProvider>
        <AppSidebar side={locale === "ar" ? "right" : "left"} />
        <SidebarInset className="min-w-0">
          <Topbar />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </CurrentUserProvider>
  );
}
