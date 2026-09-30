import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function FinanceIndex({ params }: PageProps<"/[locale]/finance">) {
  const { locale } = await params;
  redirect({ href: "/finance/budget", locale: locale as Locale });
}
