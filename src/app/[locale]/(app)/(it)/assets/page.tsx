import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function AssetsIndex({ params }: PageProps<"/[locale]/assets">) {
  const { locale } = await params;
  redirect({ href: "/assets/inventory", locale: locale as Locale });
}
