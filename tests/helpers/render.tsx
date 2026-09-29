import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";

/** Renders with the app's translations, in English unless told otherwise. `theme` adds next-themes. */
export function renderWithProviders(
  ui: ReactElement,
  { locale = "en", theme = false }: { locale?: "en" | "ar"; theme?: boolean } = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en} timeZone="Asia/Riyadh">
      {theme ? (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      ) : (
        children
      )}
    </NextIntlClientProvider>
  );
  return render(ui, { wrapper });
}
