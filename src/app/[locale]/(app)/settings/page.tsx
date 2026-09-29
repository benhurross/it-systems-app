import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function SettingsIndex({ params }: PageProps<"/[locale]/settings">) {
  const { locale } = await params;
  redirect({ href: "/settings/users", locale: locale as Locale });
}
