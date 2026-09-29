import { useLocale } from "next-intl";
import type { LookupList } from "@/lib/domain";
import type { Lookup } from "@/lib/api-types";
import { useApi } from "./use-api";

/** The reference lists, labelled in the current language. */
export function useLookups() {
  const locale = useLocale();
  const { data = [] } = useApi<Lookup[]>("/lookups");
  const label = (row: Lookup) => (locale === "ar" ? row.labelAr : row.labelEn);

  return {
    ready: data.length > 0,
    /** Label for a stored code; falls back to the code itself for values since removed. */
    label: (list: LookupList, code: string | null | undefined) => {
      if (!code) return "";
      const row = data.find((l) => l.list === list && l.code === code);
      return row ? label(row) : code;
    },
    options: (list: LookupList) =>
      data.filter((l) => l.list === list && l.active).map((l) => ({ value: l.code, label: label(l) })),
  };
}
