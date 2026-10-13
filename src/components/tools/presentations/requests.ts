"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import type messages from "../../../../messages/en.json";

type ErrorCode = keyof (typeof messages)["presentations"]["errors"];
const CODES = new Set<string>([
  "fileEmpty",
  "deckSize",
  "notPowerPoint",
  "notWidescreen",
  "noSlides",
  "previewType",
  "previewPages",
  "previewNeeded",
  "previewFailed",
  "imageType",
  "fileSize",
  "tooManyImages",
  "pdfUnavailable",
  "pdfFailed",
  "noDeck",
  "missingSlide",
  "deckMissing",
] satisfies ErrorCode[]);

/** What went wrong, in the person's language: the server's reason where there is one. */
export function useProblem() {
  const t = useTranslations("presentations.errors");
  return (error: unknown) => t(error instanceof ApiError && CODES.has(error.message) ? (error.message as ErrorCode) : "generic");
}

/** Sends a multipart form to the API; throws ApiError with the server's reason on failure. */
export async function sendForm<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch(`/api${path}`, { method, body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? res.statusText);
  return data as T;
}

/** A change to presentations: the outcome reported in the person's language. */
export function usePresentationMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  options: { success?: string; onSuccess?: (result: TResult) => void; scope?: string; gone?: string; quiet?: boolean } = {},
) {
  const problem = useProblem();
  return useMutation({
    mutationFn,
    scope: options.scope ? { id: options.scope } : undefined,
    meta: options.gone ? { gone: options.gone } : undefined,
    onSuccess: (result) => {
      if (options.success) toast.success(options.success);
      options.onSuccess?.(result);
    },
    onError: (error) => {
      if (!options.quiet) toast.error(problem(error));
    },
  });
}

/** Saves a downloaded file under its name. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The file name the server gave a download. */
export function fileNameOf(res: Response, fallback: string) {
  const header = res.headers.get("Content-Disposition") ?? "";
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  return encoded ? decodeURIComponent(encoded) : fallback;
}
