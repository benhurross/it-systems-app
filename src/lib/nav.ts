import {
  Activity,
  AppWindow,
  BookOpen,
  FolderKanban,
  GitPullRequestArrow,
  Inbox,
  LayoutDashboard,
  Monitor,
  Network,
  Settings,
  ShieldAlert,
  SquarePen,
  Target,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, type Area } from "./permissions";

export type NavItem = {
  key:
    | "home"
    | "dashboard"
    | "kpis"
    | "tickets"
    | "knowledge"
    | "changes"
    | "assets"
    | "cmdb"
    | "software"
    | "network"
    | "projects"
    | "finance"
    | "risk"
    | "people"
    | "settings"
    | "myRequests"
    | "newRequest";
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  key: "overview" | "serviceDesk" | "infrastructure" | "management" | "self" | "system";
  area: Area;
  /** Hidden from roles that also reach this area; self service is for people outside IT. */
  hiddenWith?: Area;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    key: "overview",
    area: "it",
    items: [
      { key: "dashboard", href: "/", icon: LayoutDashboard },
      { key: "kpis", href: "/kpis", icon: Target },
    ],
  },
  {
    key: "serviceDesk",
    area: "it",
    items: [
      { key: "tickets", href: "/tickets", icon: Ticket },
      { key: "knowledge", href: "/knowledge", icon: BookOpen },
      { key: "changes", href: "/changes", icon: GitPullRequestArrow },
    ],
  },
  {
    key: "infrastructure",
    area: "it",
    items: [
      { key: "assets", href: "/assets", icon: Monitor },
      { key: "cmdb", href: "/cmdb", icon: Network },
      { key: "software", href: "/software", icon: AppWindow },
      { key: "network", href: "/network", icon: Activity },
    ],
  },
  {
    key: "management",
    area: "it",
    items: [
      { key: "projects", href: "/projects", icon: FolderKanban },
      { key: "finance", href: "/finance", icon: Wallet },
      { key: "risk", href: "/risk", icon: ShieldAlert },
      { key: "people", href: "/people", icon: Users },
    ],
  },
  {
    key: "self",
    area: "request",
    hiddenWith: "it",
    items: [
      { key: "home", href: "/home", icon: LayoutDashboard },
      { key: "myRequests", href: "/requests", icon: Inbox },
      { key: "newRequest", href: "/requests/new", icon: SquarePen },
      { key: "knowledge", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    key: "system",
    area: "settings",
    items: [{ key: "settings", href: "/settings", icon: Settings }],
  },
];

export function navFor(role: string | null | undefined): NavGroup[] {
  return NAV.filter((g) => can(role, g.area) && !(g.hiddenWith && can(role, g.hiddenWith)));
}

/** Where a role lands after signing in, and where the logo points. */
export function homeFor(role: string | null | undefined): string {
  return can(role, "it") ? "/" : "/home";
}

const matches = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** The nav href a pathname belongs to: the longest one that matches, so /requests/new is not also /requests. */
export function activeHref(groups: NavGroup[], pathname: string): string | undefined {
  return groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => matches(href, pathname))
    .sort((a, b) => b.length - a.length)[0];
}
