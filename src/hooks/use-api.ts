import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

/** GET a path from this app's API; null waits. `refetchInterval` may depend on the latest data. */
export function useApi<T>(
  path: string | null,
  options?: { refetchInterval?: number | ((data: T | undefined) => number | false) },
) {
  const interval = options?.refetchInterval;
  return useQuery({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: path !== null,
    refetchInterval: typeof interval === "function" ? (query) => interval(query.state.data) : interval,
  });
}

/**
 * A mutation that reports its outcome in the user's language. Field errors from the server are
 * placed on the form when one is given; anything else becomes a toast.
 */
export function useApiMutation<TInput, TResult = unknown>(
  mutationFn: (input: TInput) => Promise<TResult>,
  options: {
    success?: string;
    // Any form will do: only its setError is used, with paths the server reports.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    form?: Pick<UseFormReturn<any, any, any>, "setError">;
    onSuccess?: (result: TResult) => void;
  } = {},
) {
  const t = useTranslations();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues?.length && options.form) {
        for (const issue of error.issues) options.form.setError(issue.path.join("."), { message: issue.message });
        toast.error(t("errors.checkFields"));
        return;
      }
      const status = error instanceof ApiError ? error.status : 0;
      const key =
        status === 403
          ? "errors.forbidden"
          : status === 404
            ? "errors.notFound"
            : status === 409
              ? "errors.conflict"
              : status === 400
                ? "errors.invalidAction"
                : "errors.generic";
      toast.error(t(key));
    },
  });
}
