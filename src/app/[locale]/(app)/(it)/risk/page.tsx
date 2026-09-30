import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function RiskIndex({ params }: PageProps<"/[locale]/risk">) {
  const { locale } = await params;
  redirect({ href: "/risk/register", locale: locale as Locale });
}
