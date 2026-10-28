"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A question mark that shows a description or instructions when the pointer rests on it, or when
 * it is clicked, tapped or opened from the keyboard, so they take no room on the page until wanted.
 */
export function Hint({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  // Opened by the pointer resting on it: kept open while it moves onto the text, shut a moment after it leaves both.
  const [hovered, setHovered] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => {
    if (leave.current) clearTimeout(leave.current);
    setHovered(true);
    setOpen(true);
  };
  const exit = () => {
    leave.current = setTimeout(() => {
      setHovered(false);
      setOpen(false);
    }, 150);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ?? t("moreInfo")}
          onPointerEnter={(e) => e.pointerType === "mouse" && enter()}
          onPointerLeave={(e) => e.pointerType === "mouse" && exit()}
          // A click after the pointer opened it keeps it open rather than shutting it.
          onClick={(e) => {
            if (hovered) {
              e.preventDefault();
              setHovered(false);
            }
          }}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            className,
          )}
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-auto max-w-80 text-sm font-normal leading-relaxed text-pretty"
        onPointerEnter={(e) => e.pointerType === "mouse" && enter()}
        onPointerLeave={(e) => e.pointerType === "mouse" && exit()}
        // Opened by the pointer, the page keeps the keyboard where it was.
        onOpenAutoFocus={(e) => hovered && e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
