import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** The short address in an asset tag's QR code, kept short so the code stays small: /a/142 opens the asset. */
export default async function AssetTagLink({ params }: PageProps<"/[locale]/a/[id]">) {
  const { locale, id } = await params;
  redirect({ href: /^\d+$/.test(id) ? `/assets/${id}` : "/assets", locale: locale as Locale });
}
