"use client";

import { Languages, Minus, Monitor, Moon, Plus, RotateCcw, Search, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTextSize } from "@/hooks/use-text-size";
import { useRouter } from "@/i18n/navigation";
import { navFor } from "@/lib/nav";
import { useCurrentUser } from "./current-user";
import { useSwitchLocale } from "./locale-switcher";

/** Ctrl+K (Cmd+K on a Mac) palette for pages and display actions. */
export function CommandMenu() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const user = useCurrentUser();
  const { setTheme } = useTheme();
  const text = useTextSize();
  const switchLocale = useSwitchLocale();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const items = navFor(user.role).flatMap((group) => group.items);
  const actions = [
    { label: t("command.themeLight"), icon: Sun, action: () => setTheme("light") },
    { label: t("command.themeDark"), icon: Moon, action: () => setTheme("dark") },
    { label: t("command.themeSystem"), icon: Monitor, action: () => setTheme("system") },
    { label: t("command.textLarger"), icon: Plus, action: text.increase },
    { label: t("command.textSmaller"), icon: Minus, action: text.decrease },
    { label: t("command.textReset"), icon: RotateCcw, action: text.reset },
    { label: t("command.switchLocale"), icon: Languages, action: switchLocale },
  ];

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 min-w-0 max-w-64 flex-1 shrink justify-start gap-2 text-muted-foreground"
      >
        <Search />
        <span className="flex-1 truncate text-start">{t("command.open")}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[0.7rem] sm:inline" dir="ltr">
          Ctrl K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t("command.open")} description={t("command.placeholder")}>
        <Command>
          <CommandInput placeholder={t("command.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("command.empty")}</CommandEmpty>
            <CommandGroup heading={t("command.pages")}>
              {items.map((item) => (
                <CommandItem key={item.href} value={t(`nav.${item.key}`)} onSelect={run(() => router.push(item.href))}>
                  <item.icon />
                  {t(`nav.${item.key}`)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={t("command.actions")}>
              {actions.map(({ label, icon: Icon, action }) => (
                <CommandItem key={label} value={label} onSelect={run(action)}>
                  <Icon />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
