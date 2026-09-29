import type { Metadata } from "next";
import { plexArabic, plexSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "AP Plus IT Systems",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexArabic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
