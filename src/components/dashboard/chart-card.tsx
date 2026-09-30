"use client";

import { ChartColumn, Table2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A chart with its title and a switch to the same values as a table, so nothing depends on colour or hover. */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("dashboard.charts");
  const [asTable, setAsTable] = useState(false);

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={asTable}
          aria-label={asTable ? t("showChart") : t("showTable")}
          title={asTable ? t("showChart") : t("showTable")}
          onClick={() => setAsTable(!asTable)}
        >
          {asTable ? <ChartColumn /> : <Table2 />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!asTable && legend}
        {asTable ? <div className="overflow-x-auto">{table}</div> : children}
      </CardContent>
    </Card>
  );
}

/** The table twin of a chart: a header row, then one row per mark. Numbers align to the end. */
export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} scope="col" className={i === 0 ? "py-1.5 pe-3 text-start font-medium" : "py-1.5 ps-3 text-end font-medium"}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[0])} className="border-b last:border-0">
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row" className="py-1.5 pe-3 text-start font-normal">
                  {cell}
                </th>
              ) : (
                <td key={i} className="py-1.5 ps-3 text-end tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A legend key: a short line for lines, a small bar for bars. The text stays in ink colours. */
export function LegendKey({ color, label, shape = "bar" }: { color: string; label: string; shape?: "bar" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden className={shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[3px]"} style={{ background: color }} />
      {label}
    </span>
  );
}
