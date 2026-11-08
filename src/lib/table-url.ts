import { DATE_PRESETS, type DatePreset, type DateRange } from "./date-range";

/**
 * A list's search, filters, sort and page, kept in the page's address so they are still there
 * after opening a record and coming Back (or reloading):
 *   ?q=nora&f.status=current&f.department=it&d.createdAt=last30&sort=-createdAt&page=2
 * Other parameters of the address are left as they are.
 */
export type TableUrlState = {
  q: string;
  /** Facet filters: column → the values chosen. */
  facets: Record<string, string[]>;
  /** Date filters: column → the range. */
  dates: Record<string, DateRange>;
  sort: { id: string; desc: boolean } | null;
  /** From 0, as the table counts. */
  page: number;
};

const OURS = (key: string) => key === "q" || key === "sort" || key === "page" || key.startsWith("f.") || key.startsWith("d.");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What the address says, for the columns the list has; anything else in it is ignored. */
export function readTableUrl(search: string, columns: { facets: string[]; date?: string; sortable?: (id: string) => boolean }): TableUrlState {
  const params = new URLSearchParams(search);
  const facets: Record<string, string[]> = {};
  for (const column of columns.facets) {
    const values = params.getAll(`f.${column}`).filter(Boolean);
    if (values.length) facets[column] = [...new Set(values)];
  }
  const dates: Record<string, DateRange> = {};
  const raw = columns.date ? params.get(`d.${columns.date}`) : null;
  if (columns.date && raw) {
    if ((DATE_PRESETS as readonly string[]).includes(raw)) dates[columns.date] = { from: null, to: null, preset: raw as DatePreset };
    else {
      const [from, to] = raw.split("~");
      const range = { from: DAY.test(from ?? "") ? from : null, to: DAY.test(to ?? "") ? to : null };
      if (range.from || range.to) dates[columns.date] = range;
    }
  }
  const sortRaw = params.get("sort");
  const sortId = sortRaw?.replace(/^-/, "");
  const sort = sortRaw && sortId && (columns.sortable?.(sortId) ?? true) ? { id: sortId, desc: sortRaw.startsWith("-") } : null;
  const page = Math.max(0, (Number.parseInt(params.get("page") ?? "1", 10) || 1) - 1);
  return { q: params.get("q") ?? "", facets, dates, sort, page };
}

/**
 * The address's query with the list's state written in, the rest kept. The sort the list starts
 * with, the first page and empty filters are left out, so an untouched list has a plain address.
 */
export function writeTableUrl(search: string, state: TableUrlState, initialSort?: { id: string; desc: boolean }) {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) if (OURS(key)) params.delete(key);
  if (state.q.trim()) params.set("q", state.q);
  for (const [column, values] of Object.entries(state.facets)) for (const v of values) params.append(`f.${column}`, v);
  for (const [column, range] of Object.entries(state.dates)) {
    if (range.preset) params.set(`d.${column}`, range.preset);
    else if (range.from || range.to) params.set(`d.${column}`, `${range.from ?? ""}~${range.to ?? ""}`);
  }
  const sameSort = state.sort?.id === initialSort?.id && state.sort?.desc === initialSort?.desc;
  if (state.sort && !sameSort) params.set("sort", `${state.sort.desc ? "-" : ""}${state.sort.id}`);
  else if (!state.sort && initialSort) params.set("sort", "none");
  if (state.page > 0) params.set("page", String(state.page + 1));
  const query = params.toString();
  return query ? `?${query}` : "";
}
