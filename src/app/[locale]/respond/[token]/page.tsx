"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useId, useState } from "react";
import { DisplayMenu } from "@/components/app-shell/display-menu";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api";

type LinkInfo = { ref: string; subject: string; resolution: string | null; name: string; state: "open" | "used" | "expired" | "answered" };
type Answer = "fixed" | "not_fixed";

/**
 * Where the links in a resolution email lead. No sign-in: the link itself is the permission.
 * Opening it changes nothing (mail scanners open links on their own); the person confirms here.
 */
export default function RespondPage({ params }: PageProps<"/[locale]/respond/[token]">) {
  const { token } = use(params);
  return (
    <Suspense>
      <Respond token={token} />
    </Suspense>
  );
}

function Respond({ token }: { token: string }) {
  const t = useTranslations("respond");
  const locale = useLocale();
  const { data, error, refetch } = useQuery({
    queryKey: ["respond", token],
    queryFn: () => api<LinkInfo>(`/respond/${encodeURIComponent(token)}`),
    retry: false,
  });
  // Kept here, not in the form: after answering, the link reads as used, which would replace the thanks.
  const [done, setDone] = useState<{ answer: Answer; ref: string } | null>(null);

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <Image src={locale === "ar" ? "/brand/applus-logo-ar.svg" : "/brand/applus-logo.svg"} alt="AP Plus" width={116} height={36} className="dark:hidden" />
        <Image
          src={locale === "ar" ? "/brand/applus-white-ar.svg" : "/brand/applus-white.svg"}
          alt="AP Plus"
          width={116}
          height={36}
          className="hidden dark:block"
        />
        <div className="flex items-center gap-1">
          <DisplayMenu />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-xl p-4 py-8">
        {done ? (
          <Message title={t("title")} text={t(done.answer === "fixed" ? "doneFixed" : "doneNotFixed", { ref: done.ref })} done />
        ) : error ? (
          <Message title={t("title")} text={t("notFound")} />
        ) : !data ? (
          <Skeleton className="h-96 w-full" />
        ) : data.state !== "open" ? (
          <Message title={t("title")} text={t(data.state, { ref: data.ref })} />
        ) : (
          <AnswerForm token={token} info={data} onStale={() => refetch()} onDone={(answer) => setDone({ answer, ref: data.ref })} />
        )}
      </main>
    </div>
  );
}

function Message({ title, text, done }: { title: string; text: string; done?: boolean }) {
  const t = useTranslations("respond");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="flex items-center gap-2 text-xl">
            {done && <CheckCircle2 className="size-6 text-success" aria-hidden />}
            {title}
          </h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role={done ? "status" : undefined}>{text}</p>
        <Button asChild variant="outline">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AnswerForm({
  token,
  info,
  onStale,
  onDone,
}: {
  token: string;
  info: LinkInfo;
  onStale: () => void;
  onDone: (answer: Answer) => void;
}) {
  const t = useTranslations("respond");
  const tc = useTranslations("errors");
  const initial = useSearchParams().get("answer") === "not-fixed" ? "not_fixed" : "fixed";
  const [answer, setAnswer] = useState<Answer>(initial);
  const [rating, setRating] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const send = useMutation({
    mutationFn: () =>
      api(`/respond/${encodeURIComponent(token)}`, {
        body: answer === "fixed" ? { answer, rating } : { answer, reason },
      }),
    onSuccess: () => onDone(answer),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) onStale();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">{t("title")}</h1>
        </CardTitle>
        <CardDescription>{t("intro", { name: info.name, ref: info.ref })}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="mb-6 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("request")}</dt>
            <dd className="font-medium break-words">
              <span className="font-mono">{info.ref}</span> {info.subject}
            </dd>
          </div>
          {info.resolution && (
            <div>
              <dt className="text-muted-foreground">{t("resolution")}</dt>
              <dd className="break-words whitespace-pre-line">{info.resolution}</dd>
            </div>
          )}
        </dl>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">{t("answer")}</legend>
            <RadioGroup value={answer} onValueChange={(v) => setAnswer(v as Answer)} className="grid gap-2 sm:grid-cols-2">
              {(["fixed", "not_fixed"] as const).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-data-[state=checked]:border-primary"
                >
                  <RadioGroupItem value={value} />
                  <span className="font-medium">{t(value === "fixed" ? "fixed" : "notFixed")}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          {answer === "fixed" ? (
            <div className="space-y-2">
              <p id="respond-rating" className="text-sm font-medium">
                {t("rate")}
              </p>
              <div role="group" aria-labelledby="respond-rating" className="flex gap-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("stars", { count: n })}
                    aria-pressed={rating === n}
                    onClick={() => setRating(rating === n ? null : n)}
                  >
                    <Star className={rating !== null && n <= rating ? "fill-warning text-warning" : "text-muted-foreground"} />
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={reasonId}>{t("reason")}</Label>
              <Textarea id={reasonId} required rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {send.isError && !(send.error instanceof ApiError && send.error.status === 409) && (
            <Alert variant="destructive">
              <AlertDescription>{tc("generic")}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={send.isPending || (answer === "not_fixed" && reason.trim() === "")}>
            {t(answer === "fixed" ? "confirmFixed" : "confirmNotFixed")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
