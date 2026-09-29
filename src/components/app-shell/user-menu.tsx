"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useCurrentUser } from "./current-user";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export function UserMenu() {
  const t = useTranslations();
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [changingPassword, setChangingPassword] = useState(false);

  const signOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/sign-in");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={user.name}>
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">{initials(user.name)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            <div className="text-xs font-normal text-muted-foreground">{t(`roles.${user.role as "admin"}`)}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
            <KeyRound />
            {t("auth.changePassword")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut />
            {t("auth.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations();
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10, t("auth.passwordRule")),
  });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: "", newPassword: "" } });

  const submit = form.handleSubmit(async (values) => {
    const { error } = await authClient.changePassword({ ...values, revokeOtherSessions: true });
    if (error) {
      form.setError("currentPassword", { message: t("auth.wrongPassword") });
      return;
    }
    toast.success(t("auth.passwordChanged"));
    form.reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("auth.changePassword")}</DialogTitle>
        </DialogHeader>
        <form id="change-password" onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.currentPassword}>
              <FieldLabel htmlFor="current-password">{t("auth.currentPassword")}</FieldLabel>
              <Input id="current-password" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
              <FieldError errors={[form.formState.errors.currentPassword]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.newPassword}>
              <FieldLabel htmlFor="new-password">{t("auth.newPassword")}</FieldLabel>
              <Input id="new-password" type="password" autoComplete="new-password" {...form.register("newPassword")} />
              <FieldError errors={[form.formState.errors.newPassword]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="change-password" disabled={form.formState.isSubmitting}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
