import { AreaGuard } from "@/components/app-shell/area-guard";

/** The slide library is kept by admins. */
export default function LibraryLayout({ children }: LayoutProps<"/[locale]/tools/presentations/library">) {
  return <AreaGuard area="settings">{children}</AreaGuard>;
}
