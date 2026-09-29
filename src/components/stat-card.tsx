import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/** A headline figure with its label, and an optional line of context such as a target. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <CardContent className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </CardContent>
  );

  return (
    <Card className="py-4 transition-colors has-[a:hover]:border-primary/40">
      {href ? (
        <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
