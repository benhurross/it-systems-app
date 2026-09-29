import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function NetworkIndex({ params }: PageProps<"/[locale]/network">) {
  const { locale } = await params;
  redirect({ href: "/network/status", locale: locale as Locale });
}
