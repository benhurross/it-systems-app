import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};

/**
 * A label on a tinted pill. The text always carries the meaning; colour only reinforces it. An
 * icon, when given, takes the place of the dot.
 */
export function StatusBadge({ tone, icon: Icon, children, className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
