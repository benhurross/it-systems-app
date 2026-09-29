"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DisplayMenu } from "@/components/app-shell/display-menu";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { homeFor } from "@/lib/nav";

// The browser checks required fields; the server decides whether the credentials are right.
const schema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export default function SignInPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const failure = form.formState.errors.root?.message;

  const submit = form.handleSubmit(async (values) => {
    const { data, error } = await authClient.signIn.email(values);
    if (error) {
      form.setError("root", { message: t(error.code === "BANNED_USER" ? "auth.banned" : "auth.invalid") });
      return;
    }
    router.replace(homeFor(data.user.role));
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Image
          src={locale === "ar" ? "/brand/applus-white-ar.svg" : "/brand/applus-white.svg"}
          alt="AP Plus"
          width={193}
          height={60}
        />
        <div className="space-y-3">
          <p className="text-3xl font-semibold text-white">{t("app.name")}</p>
          <p className="text-lg text-sidebar-muted">{t("app.tagline")}</p>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex justify-end gap-1 p-4">
          <DisplayMenu />
          <LocaleSwitcher />
        </div>
        <main className="flex flex-1 items-center justify-center p-6">
          <form onSubmit={submit} className="w-full max-w-sm space-y-6">
            <div className="space-y-2">
              <Image
                src={locale === "ar" ? "/brand/applus-logo-ar.svg" : "/brand/applus-logo.svg"}
                alt="AP Plus"
                width={155}
                height={48}
                className="mb-6 dark:hidden lg:hidden"
              />
              <h1 className="text-2xl font-semibold">{t("auth.title")}</h1>
              <p className="text-muted-foreground">{t("auth.subtitle")}</p>
            </div>
            {failure && (
              <Alert variant="destructive">
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("auth.email")}</FieldLabel>
                <Input id="email" type="email" autoComplete="email" dir="ltr" required {...form.register("email")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">{t("auth.password")}</FieldLabel>
                <Input id="password" type="password" autoComplete="current-password" required {...form.register("password")} />
              </Field>
            </FieldGroup>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t("auth.submit")}
            </Button>
          </form>
        </main>
      </div>
    </div>
  );
}
