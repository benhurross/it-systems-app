"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { FieldValues, SubmitHandler, UseFormReturn } from "react-hook-form";
import { Form } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

/** One settings form on a card, with a Save button. Shows a skeleton until its values have loaded. */
export function SettingsCard<TIn extends FieldValues, TOut extends FieldValues>({
  title,
  description,
  form,
  onSubmit,
  pending,
  loading,
  children,
}: {
  title: string;
  description?: string;
  form: UseFormReturn<TIn, unknown, TOut>;
  onSubmit: SubmitHandler<TOut>;
  pending?: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <Form form={form} onSubmit={onSubmit}>
        <CardContent>{loading ? <Skeleton className="h-40 w-full" /> : <FieldGroup>{children}</FieldGroup>}</CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button type="submit" disabled={pending || loading}>
            {t("save")}
          </Button>
        </CardFooter>
      </Form>
    </Card>
  );
}
