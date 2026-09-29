"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { activeHref, homeFor, navFor } from "@/lib/nav";
import { useCurrentUser } from "./current-user";

export function AppSidebar({ side }: { side: "left" | "right" }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const user = useCurrentUser();
  const groups = navFor(user.role);
  const active = activeHref(groups, pathname);

  return (
    <Sidebar side={side} collapsible="icon">
      <SidebarHeader className="h-16 justify-center px-3">
        <Link href={homeFor(user.role)} className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <Image
            src={locale === "ar" ? "/brand/applus-white-ar.svg" : "/brand/applus-white.svg"}
            alt="AP Plus"
            width={129}
            height={40}
            className="h-10 w-auto group-data-[collapsible=icon]:hidden"
          />
          <span className="hidden size-8 place-items-center rounded-md bg-sidebar-primary group-data-[collapsible=icon]:grid">
            <Image src="/brand/ap_head.svg" alt="AP Plus" width={16} height={18} />
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel className="text-sidebar-muted">{t(`groups.${group.key}`)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.href === active}
                    tooltip={t(item.key)}
                    className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  >
                    <Link href={item.href} aria-current={item.href === active ? "page" : undefined}>
                      <item.icon />
                      <span>{t(item.key)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
