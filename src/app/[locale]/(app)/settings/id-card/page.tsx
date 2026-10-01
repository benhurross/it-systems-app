"use client";

import { useMutation } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { CardFace, designUrl, useCardLines } from "@/components/id-cards/card-face";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { api } from "@/lib/api";
import type { CardDesign } from "@/lib/api-types";
import { MAX_UPLOAD_BYTES, sniffType } from "@/lib/files";
import { CARD_SIDES, type CardSide } from "@/lib/id-card";

const ERRORS = ["fileEmpty", "fileSize", "designType", "designShape", "designSmall"] as const;
// Example text, to show where a person's details will sit on the design.
const SAMPLE = { name: "Sara Al-Harbi", designation: "Claims Officer", number: "1234", nameFont: "auto", nameSize: null, designationFont: "auto", designationSize: null } as const;

/** The company's card design, front and back, printed edge to edge under each person's details. */
export default function IdCardSettings() {
  const t = useTranslations("settings.idCard");
  const { data, isLoading } = useApi<CardDesign>("/id-cards/design");
  const lines = useCardLines(SAMPLE);

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        {CARD_SIDES.map((side) =>
          isLoading || !data ? (
            <Skeleton key={side} className="h-96" />
          ) : (
            <DesignSide key={side} side={side} design={data} lines={side === "front" ? lines : null} />
          ),
        )}
      </div>
    </div>
  );
}

function DesignSide({ side, design, lines }: { side: CardSide; design: CardDesign; lines: ReturnType<typeof useCardLines> }) {
  const t = useTranslations("settings.idCard");
  const te = useTranslations("settings.idCard.errors");
  const current = design[side];
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      const body = new FormData();
      body.set("file", chosen);
      const res = await fetch(`/api/id-cards/design/${side}`, { method: "PUT", body });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "");
    },
    onSuccess: () => {
      toast.success(t("uploaded"));
      setFile(null);
      if (input.current) input.current.value = "";
    },
    onError: (e) => setError(te((ERRORS as readonly string[]).includes(e.message) ? (e.message as (typeof ERRORS)[number]) : "generic")),
  });
  const remove = useApiMutation(() => api(`/id-cards/design/${side}`, { method: "DELETE" }), { success: t("removed") });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(side)}</CardTitle>
        <CardDescription>{current ? t("size", { width: current.width, height: current.height }) : t("none")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="mx-auto w-full max-w-60">
          <CardFace side={side} design={designUrl(design, side)} lines={lines} label={t("previewOf", { side: t(side) })} />
        </div>
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!file) return setError(te("fileEmpty"));
            if (file.size > MAX_UPLOAD_BYTES) return setError(te("fileSize"));
            const type = sniffType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
            if (type !== "image/png" && type !== "image/jpeg") return setError(te("designType"));
            upload.mutate(file);
          }}
        >
          <Label htmlFor={inputId}>{current ? t("replace") : t("upload")}</Label>
          <Input
            ref={input}
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {t("hint")}
          </p>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="sm" disabled={upload.isPending}>
              <Upload />
              {t("uploadSide", { side: t(side) })}
            </Button>
          </div>
        </form>
      </CardContent>
      {current && (
        <CardFooter className="justify-end">
          <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>
            <Trash2 />
            {t("remove", { side: t(side) })}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
