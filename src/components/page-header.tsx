import type { ReactNode } from "react";
import { Hint } from "./hint";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <Hint>{description}</Hint>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
