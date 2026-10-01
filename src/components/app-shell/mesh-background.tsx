import { cn } from "@/lib/utils";

/**
 * Soft glows of the brand colours drifting slowly behind the pages, under the glass of the cards.
 * Decoration only: hidden from screen readers, and still for people who ask for less motion.
 */
export function MeshBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("mesh pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      <div className="mesh-glow mesh-glow-1" />
      <div className="mesh-glow mesh-glow-2" />
      <div className="mesh-glow mesh-glow-3" />
    </div>
  );
}
