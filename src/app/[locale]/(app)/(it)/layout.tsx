import { AreaGuard } from "@/components/app-shell/area-guard";

export default function ItLayout({ children }: LayoutProps<"/[locale]">) {
  return <AreaGuard area="it">{children}</AreaGuard>;
}
