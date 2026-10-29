"use client";

import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
  const [creating, setCreating] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/60 px-3 backdrop-blur-xl md:px-4">
      <SidebarTrigger aria-label={t("common.toggleSidebar")} />
      <CommandMenu />
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <Button size="sm" className="hidden md:inline-flex" onClick={() => setCreating(true)}>
          <Plus />
          {t(it ? "common.newTicket" : "nav.newRequest")}
        </Button>
        <DisplayMenu />
        <LocaleSwitcher />
        <UserMenu />
      </div>
      {creating && (it ? <NewTicketDialog onClose={() => setCreating(false)} /> : <NewRequestDialog onClose={() => setCreating(false)} />)}
    </header>
  );
}
