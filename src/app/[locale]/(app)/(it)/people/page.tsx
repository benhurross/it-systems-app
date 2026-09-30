import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function PeopleIndex({ params }: PageProps<"/[locale]/people">) {
  const { locale } = await params;
  redirect({ href: "/people/directory", locale: locale as Locale });
}
