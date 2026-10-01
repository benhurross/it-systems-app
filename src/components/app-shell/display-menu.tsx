"use client";

import { ALargeSmall, Minus, Monitor, Moon, Plus, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
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

/** Light, dark or the device's own theme, and the text size, from the top bar. */
export function DisplayMenu() {
  const t = useTranslations("display");
  const { theme, setTheme } = useTheme();
  const text = useTextSize();
  const format = useFormat();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("title")}>
          <ALargeSmall />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-5 rounded-3xl p-5">
        <ToggleGroup
          type="single"
          aria-label={t("theme")}
          value={theme}
          onValueChange={(value) => value && setTheme(value)}
          className="grid w-full grid-cols-3 gap-1 rounded-2xl border bg-muted p-1 dark:border-foreground/40 dark:bg-background"
        >
          {THEMES.map(({ value, icon: Icon, chosen }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={t(value)}
              title={t(value)}
              className={cn(
                "h-12 rounded-xl text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground dark:text-foreground dark:hover:text-foreground",
                "data-[state=on]:bg-background data-[state=on]:shadow-sm dark:data-[state=on]:bg-muted [&_svg:not([class*='size-'])]:size-7",
                chosen,
              )}
            >
              <Icon strokeWidth={1.75} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="space-y-3">
          <p className="text-center text-sm font-medium">{t("textSize")}</p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <Button
              variant="outline"
              aria-label={t("smaller")}
              disabled={text.size === TEXT_SIZES[0]}
              onClick={text.decrease}
              className="size-11 rounded-xl dark:border-foreground/40 [&_svg:not([class*='size-'])]:size-5"
            >
              <Minus />
            </Button>
            <output aria-live="polite" className="text-center text-2xl font-medium tabular-nums">
              {format.percent(text.size / 100)}
            </output>
            <Button
              variant="outline"
              aria-label={t("larger")}
              disabled={text.size === TEXT_SIZES.at(-1)}
              onClick={text.increase}
              className="size-11 rounded-xl dark:border-foreground/40 [&_svg:not([class*='size-'])]:size-5"
            >
              <Plus />
            </Button>
          </div>
          {/* Back to the usual size, offered only once it has changed. */}
          {text.size !== DEFAULT_TEXT_SIZE && (
            <Button variant="link" size="sm" className="mx-auto flex" onClick={text.reset}>
              {t("reset")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
