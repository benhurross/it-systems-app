"use client";

import { ALargeSmall, Minus, Monitor, Moon, Plus, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat } from "@/hooks/use-format";
import { useTextSize } from "@/hooks/use-text-size";
import { TEXT_SIZES } from "@/lib/text-size";

const THEMES = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

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
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2">
          <p id="display-theme" className="text-sm font-medium">
            {t("theme")}
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="display-theme"
            value={theme}
            onValueChange={(value) => value && setTheme(value)}
            className="w-full"
          >
            {THEMES.map(({ value, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
                <Icon />
                {t(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("textSize")}</p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("smaller")}
              disabled={text.size === TEXT_SIZES[0]}
              onClick={text.decrease}
            >
              <Minus />
            </Button>
            <output aria-live="polite" className="flex-1 text-center text-sm tabular-nums">
              {format.percent(text.size / 100)}
            </output>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("larger")}
              disabled={text.size === TEXT_SIZES.at(-1)}
              onClick={text.increase}
            >
              <Plus />
            </Button>
            <Button variant="ghost" onClick={text.reset}>
              {t("reset")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
