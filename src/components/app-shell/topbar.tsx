"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/permissions";
import { CommandMenu } from "./command-menu";
import { useCurrentUser } from "./current-user";
import { DisplayMenu } from "./display-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

export function Topbar() {
  const t = useTranslations();
  const user = useCurrentUser();
  const it = can(user.role, "it");

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-4">
      <SidebarTrigger aria-label={t("common.toggleSidebar")} />
      <CommandMenu />
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Button asChild size="sm" className="hidden md:inline-flex">
          <Link href={it ? "/tickets/new" : "/requests/new"}>
            <Plus />
            {t(it ? "common.newTicket" : "nav.newRequest")}
          </Link>
        </Button>
        <DisplayMenu />
        <LocaleSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
