import { AppShell } from "@/components/app-shell/app-shell";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return <AppShell>{children}</AppShell>;
}
