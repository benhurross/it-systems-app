"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Search, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ComboboxField, FormDialog, SelectField } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { Asset, Relationship } from "@/lib/api-types";
import { impactOf, neighbours } from "@/lib/cmdb";
import { RELATION_TYPES } from "@/lib/domain";
import { END_USER_CATEGORY } from "@/lib/lifecycle";
import { relationshipInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export default function CmdbPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Cmdb />
    </Suspense>
  );
}

function Cmdb() {
  const t = useTranslations();
  const lookups = useLookups();
  const initial = Number(useSearchParams().get("item")) || null;
  const [selectedId, setSelectedId] = useState<number | null>(initial);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: assets = [] } = useApi<Asset[]>("/assets");
  const { data: relations = [] } = useApi<Relationship[]>("/relationships");
  // On narrow screens the details sit below the list, so bring them into view.
  const pick = (id: number) => {
    setSelectedId(id);
    if (matchMedia("(width < 64rem)").matches) document.getElementById("cmdb-detail")?.scrollIntoView({ behavior: "smooth" });
  };
  const remove = useApiMutation((id: number) => api(`/relationships/${id}`, { method: "DELETE" }), { success: t("cmdb.removed") });

  // Configuration items: everything but individual end-user devices, plus anything already related.
  const related = new Set(relations.flatMap((r) => [r.sourceId, r.targetId]));
  const items = assets
    .filter((a) => a.status !== "retired" && (a.category !== END_USER_CATEGORY || related.has(a.id)))
    .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  const selected = assets.find((a) => a.id === selectedId) ?? null;
  const nameOf = (id: number) => assets.find((a) => a.id === id)?.name ?? `#${id}`;
  const impact = selected ? impactOf(selected.id, relations) : [];
  const direct = selected ? neighbours(selected.id, relations) : null;

  return (
    <>
      <PageHeader title={t("cmdb.title")} description={t("cmdb.intro")} />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t("cmdb.items")}</CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label={t("cmdb.search")}
                placeholder={t("cmdb.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="ps-9"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto lg:max-h-[32rem]">
            <ul className="space-y-0.5">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => pick(a.id)}
                    aria-current={a.id === selectedId ? "true" : undefined}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted",
                      a.id === selectedId && "bg-brand-soft font-medium text-brand",
                    )}
                  >
                    <span className="block truncate">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{lookups.label("asset_category", a.category)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div id="cmdb-detail" className="min-w-0 scroll-mt-20">
          {!selected || !direct ? (
            <Card className="grid min-h-64 place-items-center text-muted-foreground">
              <p>{t("cmdb.select")}</p>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {t("cmdb.graph")}:{" "}
                    <Link href={`/assets/${selected.id}`} className="text-primary hover:underline">
                      {selected.name}
                    </Link>
                  </CardTitle>
                  <Button size="sm" onClick={() => setAdding(true)}>
                    <Plus />
                    {t("cmdb.add")}
                  </Button>
                </CardHeader>
                <CardContent>
                  <Graph selected={selected} relations={relations} nameOf={nameOf} onSelect={setSelectedId} />
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TriangleAlert className="size-4 text-warning" />
                      {t("cmdb.impact")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {impact.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("cmdb.noImpact")}</p>
                    ) : (
                      <>
                        <p className="mb-3 text-sm font-medium">{t("cmdb.impactCount", { count: String(impact.length) })}</p>
                        <ul className="flex flex-wrap gap-2">
                          {impact.map((id) => (
                            <li key={id}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(id)}
                                className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger hover:underline"
                              >
                                {nameOf(id)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("assets.relationships")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {[
                      [t("cmdb.reliesOn"), direct.reliesOn, (r: Relationship) => r.targetId],
                      [t("cmdb.reliedOnBy"), direct.reliedOnBy, (r: Relationship) => r.sourceId],
                    ].map(([title, list, other]) => (
                      <div key={title as string}>
                        <p className="mb-1.5 font-medium">{title as string}</p>
                        <ul className="space-y-1">
                          {(list as Relationship[]).map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">
                                <span className="text-muted-foreground">{t(`enums.relationType.${r.type}`)}</span>{" "}
                                {nameOf((other as (r: Relationship) => number)(r))}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`${t("cmdb.remove")}: ${nameOf((other as (r: Relationship) => number)(r))}`}
                                onClick={() => remove.mutate(r.id)}
                              >
                                <Trash2 />
                              </Button>
                            </li>
                          ))}
                          {(list as Relationship[]).length === 0 && <li className="text-muted-foreground">—</li>}
                        </ul>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
      {adding && selected && <RelationshipDialog source={selected} assets={assets} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Edges run left to right, from what relies to what it relies on. */
const SIDES = { sourcePosition: Position.Right, targetPosition: Position.Left };

/** Dependents on the left, the selected item in the middle, what it relies on to the right. */
function Graph({
  selected,
  relations,
  nameOf,
  onSelect,
}: {
  selected: Asset;
  relations: Relationship[];
  nameOf: (id: number) => string;
  onSelect: (id: number) => void;
}) {
  const t = useTranslations("enums.relationType");
  const { resolvedTheme } = useTheme();
  const { reliesOn, reliedOnBy } = neighbours(selected.id, relations);
  const column = (ids: number[], x: number): Node[] =>
    ids.map((id, i) => ({
      id: String(id),
      ...SIDES,
      position: { x, y: (i - (ids.length - 1) / 2) * 70 },
      data: { label: nameOf(id) },
      style: { width: 170, fontSize: "0.75rem" },
    }));
  const nodes: Node[] = [
    ...column(reliedOnBy.map((r) => r.sourceId), 0),
    {
      id: String(selected.id),
      ...SIDES,
      position: { x: 280, y: 0 },
      data: { label: selected.name },
      style: { width: 170, fontSize: "0.8rem", fontWeight: 600, borderColor: "var(--primary)", borderWidth: 2 },
    },
    ...column(reliesOn.map((r) => r.targetId), 560),
  ];
  const edges: Edge[] = [...reliedOnBy, ...reliesOn].map((r) => ({
    id: String(r.id),
    source: String(r.sourceId),
    target: String(r.targetId),
    label: t(r.type),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: r.type === "backs_up" ? { strokeDasharray: "4 3" } : undefined,
  }));

  return (
    <div dir="ltr" className="h-[26rem] overflow-hidden rounded-lg border">
      <ReactFlow
        key={selected.id}
        nodes={nodes}
        edges={edges}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelect(Number(node.id))}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

type Input = z.input<typeof relationshipInput>;
type Output = z.output<typeof relationshipInput>;

function RelationshipDialog({ source, assets, onClose }: { source: Asset; assets: Asset[]; onClose: () => void }) {
  const t = useTranslations();
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(relationshipInput),
    defaultValues: { sourceId: source.id, type: "depends_on" },
  });
  const add = useApiMutation((values: Output) => api("/relationships", { body: values }), {
    form,
    success: t("cmdb.added"),
    onSuccess: onClose,
  });
  return (
    <FormDialog
      open
      onOpenChange={onClose}
      title={t("cmdb.addTitle", { name: source.name })}
      form={form}
      onSubmit={(values) => add.mutate(values)}
      pending={add.isPending}
    >
      <SelectField
        name="type"
        label={t("cmdb.relation")}
        options={RELATION_TYPES.map((r) => ({ value: r, label: t(`enums.relationType.${r}`) }))}
      />
      <ComboboxField
        name="targetId"
        label={t("cmdb.target")}
        options={assets.filter((a) => a.id !== source.id && a.status !== "retired").map((a) => ({ value: a.id, label: a.name }))}
      />
    </FormDialog>
  );
}
