"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FORM_DOCUMENT, IT_FORM_KINDS, type ItFormKind } from "@/lib/it-forms";

/** "New form", with the four forms to choose from. */
export function NewFormMenu({ onPick, children, variant = "default", size }: { onPick: (kind: ItFormKind) => void; children: ReactNode; variant?: "default" | "outline"; size?: "sm" }) {
  const t = useTranslations("itForms");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size}>
          {children}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {IT_FORM_KINDS.map((k) => (
          <DropdownMenuItem key={k} onSelect={() => onPick(k)} className="flex-col items-start gap-0">
            <span>{t(`kinds.${k}`)}</span>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {FORM_DOCUMENT[k].formatNo}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
