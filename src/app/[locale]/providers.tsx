"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { z } from "zod";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

function makeQueryClient() {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
    // An expired session sends the user back to sign-in rather than showing broken pages.
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          // A full reload, on purpose: it drops everything the expired session had loaded.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/${document.documentElement.lang}/sign-in`);
        }
      },
    }),
    // Any successful change refetches what is on screen, so counts and dashboards are never stale.
    mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }),
  });
  return client;
}

export function Providers({ dir, children }: { dir: "ltr" | "rtl"; children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const required = useTranslations("validation")("required");
  // Zod's messages follow the page language, and an empty required field just says so rather than
  // reporting a type. A language switch loads a new document, so configuring once is enough.
  useState(() =>
    z.config({
      ...(dir === "rtl" ? z.locales.ar() : z.locales.en()),
      customError: (issue) => {
        const empty =
          (issue.code === "invalid_type" && (issue.input === undefined || issue.input === null)) ||
          (issue.code === "too_small" && issue.origin === "string" && issue.minimum === 1);
        return empty ? required : undefined;
      },
    }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DirectionProvider dir={dir}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {children}
            <Toaster dir={dir} position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
          </TooltipProvider>
        </QueryClientProvider>
      </DirectionProvider>
    </ThemeProvider>
  );
}
