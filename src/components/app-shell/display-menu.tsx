"use client";

import { ALargeSmall, Minus, Monitor, Moon, Plus, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat } from "@/hooks/use-format";
import { useTextSize } from "@/hooks/use-text-size";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from "@/lib/text-size";
import { cn } from "@/lib/utils";

// Each choice's icon takes its own colour when chosen, in either theme; the others stay quiet.
const THEMES = [
  { value: "light", icon: Sun, chosen: "data-[state=on]:text-theme-light dark:data-[state=on]:text-theme-light" },
  { value: "dark", icon: Moon, chosen: "data-[state=on]:text-theme-dark dark:data-[state=on]:text-theme-dark" },
  { value: "system", icon: Monitor, chosen: "data-[state=on]:text-theme-system dark:data-[state=on]:text-theme-system" },
] as const;

/**
 * Switches the theme with the page cross-fading from the old look to the new one (slowly: see
 * the view transition in globals.css). Browsers without view transitions, and people who ask
 * for less motion, get the change at once.
 */
function useThemeChange() {
  const { setTheme } = useTheme();
  return (value: string) => {
    const root = document.documentElement;
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const apply = () => {
      // Applied here, inside the transition, rather than after React's next render.
      root.classList.toggle("dark", dark);
      root.classList.toggle("light", !dark);
      root.style.colorScheme = dark ? "dark" : "light";
      setTheme(value);
    };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || still || dark === root.classList.contains("dark")) apply();
    else document.startViewTransition(apply);
  };
}

/** Light, dark or the device's own theme, and the text size, from the top bar. */
export function DisplayMenu() {
  const t = useTranslations("display");
  const { theme } = useTheme();
  const changeTheme = useThemeChange();
  const text = useTextSize();
  const format = useFormat();
  const chosen = THEMES.findIndex((x) => x.value === theme);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("title")}>
          <ALargeSmall />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("title")}
        className="w-36 gap-2 rounded-2xl bg-popover/45 p-2 shadow-glass ring-foreground/10 glass-sheen backdrop-blur-md backdrop-saturate-150 dark:bg-popover/30 dark:ring-white/15"
      >
        <ToggleGroup
          type="single"
          aria-label={t("theme")}
          value={theme}
          onValueChange={(value) => value && changeTheme(value)}
          className="relative grid w-full grid-cols-3 gap-0 rounded-xl border border-foreground/10 bg-foreground/5 p-0.5 dark:border-foreground/30 dark:bg-black/20"
        >
          {/* The highlight glides slowly to the chosen theme. */}
          {chosen >= 0 && (
            <span
              aria-hidden
              style={{ "--chosen": chosen } as CSSProperties}
              className="absolute start-0.5 top-0.5 bottom-0.5 w-[calc((100%-4px)/3)] translate-x-[calc(var(--chosen)*100%)] rounded-lg bg-background/80 shadow-sm transition-transform duration-700 ease-in-out rtl:translate-x-[calc(var(--chosen)*-100%)] dark:bg-white/15"
            />
          )}
          {THEMES.map(({ value, icon: Icon, chosen: colour }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={t(value)}
              title={t(value)}
              className={cn(
                "relative h-7 min-w-0 rounded-lg px-0 text-muted-foreground/60 transition-colors duration-700 hover:bg-transparent hover:text-muted-foreground dark:text-foreground dark:hover:text-foreground",
                "data-[state=on]:bg-transparent [&_svg:not([class*='size-'])]:size-4",
                colour,
              )}
            >
              <Icon strokeWidth={1.75} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-center text-xs font-medium">{t("textSize")}</p>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
          <Button
            variant="outline"
            aria-label={t("smaller")}
            disabled={text.size === TEXT_SIZES[0]}
            onClick={text.decrease}
            className="size-7 rounded-lg border-foreground/15 bg-background/40 dark:border-foreground/30 dark:bg-white/5 [&_svg:not([class*='size-'])]:size-3.5"
          >
            <Minus />
          </Button>
          <output aria-live="polite" className="text-center text-sm font-semibold tabular-nums">
            {format.percent(text.size / 100)}
          </output>
          <Button
            variant="outline"
            aria-label={t("larger")}
            disabled={text.size === TEXT_SIZES.at(-1)}
            onClick={text.increase}
            className="size-7 rounded-lg border-foreground/15 bg-background/40 dark:border-foreground/30 dark:bg-white/5 [&_svg:not([class*='size-'])]:size-3.5"
          >
            <Plus />
          </Button>
        </div>
        {/* Back to the usual size, offered only once it has changed. */}
        {text.size !== DEFAULT_TEXT_SIZE && (
          <Button variant="link" size="xs" className="mx-auto h-auto py-0" onClick={text.reset}>
            {t("reset")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
