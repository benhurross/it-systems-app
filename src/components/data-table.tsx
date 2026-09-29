"use client";

import {
  columnFacetingFeature,
  columnFilteringFeature,
  createColumnHelper,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, ListFilter, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/hooks/use-format";
import { useRouter } from "@/i18n/navigation";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { arrHas: filterFn_arrHas, includesString: filterFn_includesString },
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

type Features = typeof dataTableFeatures;

/** Column helper typed for DataTable. Facet columns should set `filterFn: "arrHas"`. */
export const columnHelper = <T extends RowData>() => createColumnHelper<Features, T>();

export type Facet = { column: string; label: string; options: { value: string; label: string }[] };

export function DataTable<T extends RowData>({
  data,
  columns,
  facets = [],
  csv,
  rowHref,
  toolbar,
  loading,
  pageSize = 20,
  initialSort,
}: {
  data: T[];
  // Accessor columns carry their own value types, so the list is typed loosely here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<Features, T, any>[];
  facets?: Facet[];
  csv?: { filename: string; columns: CsvColumn<T>[]; label?: string };
  rowHref?: (row: T) => string;
  toolbar?: ReactNode;
  loading?: boolean;
  pageSize?: number;
  initialSort?: { id: string; desc: boolean };
}) {
  const t = useTranslations();
  const format = useFormat();
  const router = useRouter();
  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    globalFilterFn: "includesString",
    initialState: {
      sorting: initialSort ? [initialSort] : [],
      pagination: { pageIndex: 0, pageSize },
    },
  });

  const filtered = table.getPrePaginatedRowModel().rows;
  const { pageIndex } = table.state.pagination;
  const from = filtered.length === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, filtered.length);
  const filtering = table.state.globalFilter || table.state.columnFilters.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t("table.filter")}
          placeholder={t("table.filter")}
          value={table.state.globalFilter ?? ""}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
        {facets.map((facet) => (
          <FacetFilter key={facet.column} facet={facet} column={table.getColumn(facet.column)} />
        ))}
        {filtering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              table.setGlobalFilter("");
              table.resetColumnFilters();
            }}
          >
            <X />
            {t("table.clearFilters")}
          </Button>
        )}
        <div className="ms-auto flex items-center gap-2">
          {toolbar}
          {csv && (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => downloadCsv(csv.filename, toCsv(filtered.map((r) => r.original), csv.columns))}
            >
              <Download />
              {csv.label ?? t("common.exportCsv")}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead key={header.id} className="text-muted-foreground">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                      >
                        <table.FlexRender header={header} />
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3.5" />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">
                  {data.length === 0 ? t("table.empty") : t("table.noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={rowHref ? "cursor-pointer" : undefined}
                  onClick={
                    rowHref
                      ? (e) => {
                          // Links and buttons inside the row handle their own clicks.
                          if (!(e.target as HTMLElement).closest("a, button")) router.push(rowHref(row.original));
                        }
                      : undefined
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">
          {t("table.range", { from: format.number(from), to: format.number(to), total: format.number(filtered.length) })}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("table.previous")}
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("table.next")}
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FacetFilter<T extends RowData>({ facet, column }: { facet: Facet; column?: Column<Features, T, unknown> }) {
  const selected = (column?.getFilterValue() as string[] | undefined) ?? [];
  const counts = column?.getFacetedUniqueValues();

  const toggle = (value: string, checked: boolean) => {
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    column?.setFilterValue(next.length ? next : undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <ListFilter />
          {facet.label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
              {selected.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {facet.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex-1">{option.label}</span>
            <span className="ms-3 text-xs tabular-nums text-muted-foreground">{counts?.get(option.value) ?? 0}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
