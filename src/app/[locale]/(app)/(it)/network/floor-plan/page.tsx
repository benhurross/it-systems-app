"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Download, Ellipsis, Map as MapIcon, Maximize, Move, Pencil, Plus, Server, Settings2, Square, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense, useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { EnumBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { OutletDialog, outletName, PlanSettingsDialog } from "@/components/network/floor-plan/dialogs";
import { RackPanel } from "@/components/network/floor-plan/rack-panel";
import { UploadDialog } from "@/components/network/floor-plan/upload-dialog";
import { NetworkHeader } from "@/components/network/network-header";
import { Hint } from "@/components/hint";
import { PdfPage, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import type { FloorPlan, FloorPlanSummary, Outlet } from "@/lib/api-types";
import { outletMatches } from "@/lib/floor-plan";
import { defaultRoles, readSvgPlan, type SvgPlan } from "@/lib/svg-plan";
import type { OutletLook, Plan3DProps } from "@/components/network/floor-plan/plan-3d";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// Three.js is loaded only for a plan shown in 3D.
const Plan3D = dynamic<Plan3DProps>(() => import("@/components/network/floor-plan/plan-3d"), {
  ssr: false,
  loading: () => <Skeleton className="h-[70vh] w-full rounded-xl" />,
});

/** An SVG drawing read for the 3D view; null when it cannot be. */
function readModel(bytes: Uint8Array) {
  try {
    return readSvgPlan(new DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml"));
  } catch {
    return null;
  }
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const ALL = "all";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function FloorPlanPage() {
  // The plan, a search or an outlet can be asked for in the address (?plan=, ?find=, ?outlet=).
  return (
    <Suspense>
      <FloorPlans />
    </Suspense>
  );
}

function FloorPlans() {
  const t = useTranslations("floorPlan");
  const params = useSearchParams();
  const { data: plans } = useApi<FloorPlanSummary[]>("/floor-plans");
  const [chosen, setChosen] = useState<number | null>(Number(params.get("plan")) || null);
  const [uploading, setUploading] = useState(false);
  const planId = plans?.some((p) => p.id === chosen) ? chosen : (plans?.[0]?.id ?? null);

  const upload = (
    <Button variant={plans?.length ? "outline" : "default"} onClick={() => setUploading(true)}>
      <Upload />
      {t("upload")}
    </Button>
  );
  return (
    <>
      <NetworkHeader />
      {!plans ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : planId === null ? (
        <EmptyState icon={MapIcon} title={t("empty")} description={t("emptyHint")} action={upload} />
      ) : (
        <PlanView key={planId} planId={planId} plans={plans} onChoose={setChosen} upload={upload} params={params} />
      )}
      {uploading && <UploadDialog plan={null} onClose={() => setUploading(false)} onSaved={setChosen} />}
    </>
  );
}

function PlanView({
  planId,
  plans,
  onChoose,
  upload,
  params,
}: {
  planId: number;
  plans: FloorPlanSummary[];
  onChoose: (id: number) => void;
  upload: ReactNode;
  params: URLSearchParams;
}) {
  const t = useTranslations("floorPlan");
  const format = useFormat();
  const searchId = useId();
  const searchHint = useId();
  const problemsId = useId();
  const { data: plan, error: missing } = useApi<FloorPlan>(`/floor-plans/${planId}`);
  // A plan deleted meanwhile (by someone else, say): the list is read again and another shown.
  const queries = useQueryClient();
  useEffect(() => {
    if (missing) void queries.invalidateQueries({ queryKey: ["/floor-plans"] });
  }, [missing, queries]);
  // The drawing, fetched again when a new one is uploaded.
  const { data: bytes = null } = useQuery({
    queryKey: [`/floor-plans/${planId}/drawing`, plan?.drawingVersion],
    meta: { versioned: true },
    enabled: !!plan,
    queryFn: async () => {
      const res = await fetch(`/api/floor-plans/${planId}/drawing`);
      if (!res.ok) throw new Error(String(res.status));
      return new Uint8Array(await res.arrayBuffer());
    },
    staleTime: Infinity,
  });
  const svg = plan?.format === "svg";
  const doc = usePdfDocument(svg ? null : bytes);
  const model = useMemo<SvgPlan | null>(() => (svg && bytes ? readModel(bytes) : null), [svg, bytes]);
  const roles = useMemo(() => (model ? { ...defaultRoles(model.layers), ...plan?.layers } : {}), [model, plan?.layers]);

  const [query, setQuery] = useState(params.get("find") ?? "");
  const [switchNo, setSwitchNoState] = useState<number | null>(null);
  const [panelNo, setPanelNoState] = useState<number | null>(null);
  // A switch or a patch panel is looked at, not both.
  const setSwitchNo = (n: number | null) => {
    setSwitchNoState(n);
    if (n !== null) setPanelNoState(null);
  };
  const setPanelNo = (n: number | null) => {
    setPanelNoState(n);
    if (n !== null) setSwitchNoState(null);
  };
  const [view, setView] = useState<"3d" | "top">("3d");
  const [networkOnly, setNetworkOnly] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [showProblems, setShowProblems] = useState(false);
  const [selected, setSelected] = useState<number | null>(Number(params.get("outlet")) || null);
  const [placing, setPlacing] = useState<{ move?: Outlet; rack?: true } | null>(null);
  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [dialog, setDialog] = useState<"replace" | "settings" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawn, setDrawn] = useState(false);
  // A point of the page (fractions) to bring to the middle of the view, once the page is its new size.
  const [focus, setFocus] = useState<{ x: number; y: number; n: number } | null>(null);
  const map = useRef<HTMLDivElement>(null);
  // The sticky controls' height, for the plan to sit just under them.
  const bar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(120);
  const loaded = !!plan;
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
    // The controls appear once the plan has loaded.
  }, [loaded]);
  const zoomBy = useCallback((step: 1 | -1) => setZoom((z) => ZOOMS[clamp(ZOOMS.indexOf(z) + step, 0, ZOOMS.length - 1)]), []);
  const onDrawn = useCallback(() => setDrawn(true), []);

  const outlets = useMemo(() => plan?.outlets ?? [], [plan]);
  const matches = useMemo(() => outlets.filter((o) => outletMatches({ ...o, device: o.assetName }, query)), [outlets, query]);
  const hit = new Set(matches.map((o) => o.id));
  const problemOutlets = outlets.filter((o) => o.problems.length);
  const current = outlets.find((o) => o.id === selected) ?? null;

  const placeRack = useApiMutation((at: { x: number; y: number }) => api(`/floor-plans/${planId}`, { method: "PATCH", body: { rack: at } }), { success: t("rackPlaced") });
  const move = useApiMutation(
    ({ outlet, x, y }: { outlet: Outlet; x: number; y: number }) =>
      api(`/outlets/${outlet.id}`, {
        method: "PATCH",
        body: { panel: outlet.panel, panelPort: outlet.panelPort, switchNo: outlet.switchNo, switchPort: outlet.switchPort, x, y, room: outlet.room, assetId: outlet.assetId, note: outlet.note },
      }),
    { success: t("moved") },
  );

  // Brings a point to the middle of the view: the page is laid out at its new size by now.
  useEffect(() => {
    if (!focus || !drawn) return;
    const frame = requestAnimationFrame(() => {
      const scroller = map.current?.querySelector<HTMLElement>("[data-pdf-scroller]");
      const canvas = scroller?.querySelector("canvas");
      if (!scroller || !canvas) return;
      const page = canvas.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      scroller.scrollLeft += page.left + focus.x * page.width - (view.left + view.width / 2);
      scroller.scrollTop += page.top + focus.y * page.height - (view.top + view.height / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, zoom, drawn]);

  /** Zooms to show every outlet (or those given), as large as fits. */
  const fitTo = useCallback(
    (list: Outlet[]) => {
      if (!plan || !list.length) return;
      const xs = list.map((o) => o.x);
      const ys = list.map((o) => o.y);
      if (plan.format === "svg") {
        if (list.length === plan.outlets.length) setFitRequest((n) => n + 1);
        else setFocus({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, n: Date.now() });
        return;
      }
      const scroller = map.current?.querySelector<HTMLElement>("[data-pdf-scroller]");
      if (!scroller) return;
      const w = Math.max(...xs) - Math.min(...xs) + (2 * plan.markWidth) / plan.pageWidth;
      const h = Math.max(...ys) - Math.min(...ys) + (2 * plan.markHeight) / plan.pageHeight;
      const across = scroller.clientWidth - 32;
      // The page fits the space across at 1; so many times larger, the outlets fill the view.
      const want = Math.min(0.95 / w, (0.95 * (scroller.clientHeight - 32)) / ((across * plan.pageHeight) / plan.pageWidth) / h);
      setZoom(ZOOMS.findLast((z) => z <= want) ?? ZOOMS[0]);
      setFocus({ x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, n: Date.now() });
    },
    [plan],
  );

  // On opening: the outlet asked for, else what was searched for, else every outlet, once the
  // drawing is first drawn.
  const open = useEffectEvent(() => {
    if (!plan) return;
    const asked = plan.outlets.find((o) => o.id === selected);
    if (asked) {
      setZoom(4);
      setFocus({ x: asked.x, y: asked.y, n: Date.now() });
    } else fitTo(query && matches.length ? matches : plan.outlets);
  });
  const opened = useRef(false);
  const ready = svg ? !!model : drawn;
  useEffect(() => {
    if (!ready || opened.current) return;
    opened.current = true;
    open();
  }, [ready]);

  const select = (o: Outlet) => {
    setSelected(o.id);
    if (zoom < 3) setZoom(3);
    setFocus({ x: o.x, y: o.y, n: Date.now() });
  };

  /** Nothing chosen: no outlet, switch or patch panel, and so no cables drawn. */
  const clearSelection = () => {
    setSelected(null);
    setSwitchNoState(null);
    setPanelNoState(null);
  };

  // Escape stops placing something, else lets go of what is chosen.
  const escape = useEffectEvent(() => (placing ? setPlacing(null) : clearSelection()));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // Not when a dialog or a menu is open: Escape closes that.
      if (e.key === "Escape" && !document.querySelector("[role=dialog],[role=menu],[role=listbox]")) escape();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (!plan) return <Skeleton className="h-[60vh] w-full" />;
  // Under the app's bar (4rem) and the controls, with a little room.
  const stickyTop = 64 + barHeight + 12;
  const markW = plan.markWidth / plan.pageWidth;
  const markH = plan.markHeight / plan.pageHeight;
  const filtering = query.trim() !== "" || switchNo !== null || panelNo !== null;
  const label = (o: Outlet) => outletName(o) || t("unlabelled");
  const inGroup = (o: Outlet) => (switchNo !== null && o.switchNo === switchNo) || (panelNo !== null && o.panel === panelNo);
  const look = (o: Outlet): OutletLook =>
    o.id === selected ? "selected" : hit.has(o.id) ? "hit" : inGroup(o) ? "group" : showProblems && o.problems.length ? "problem" : filtering ? "faded" : "normal";
  // The rack where it was put, else in the room the drawing calls the server room.
  const serverRoom = model?.rooms.find((r) => /server/i.test(r.text)) ?? null;
  const rack = plan.rack ?? (serverRoom ? { x: serverRoom.x, y: serverRoom.y } : null);
  const traced = current ? [current.id] : outlets.filter(inGroup).map((o) => o.id);
  const place = (at: { x: number; y: number }) => {
    if (placing?.rack) placeRack.mutate(at);
    else if (placing?.move) move.mutate({ outlet: placing.move, ...at });
    else setAdding(at);
    setPlacing(null);
  };

  return (
    <div className="space-y-4">
      {/* The controls stay at the top as the page scrolls, under the app's own bar. */}
      <div ref={bar} className="sticky top-16 z-10 -mx-4 space-y-2 border-b bg-background/90 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-end gap-3">
        {plans.length > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${searchId}-plan`}>{t("plan")}</Label>
            <Select value={String(planId)} onValueChange={(v) => onChoose(Number(v))}>
              <SelectTrigger id={`${searchId}-plan`} className="w-48 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid min-w-0 basis-64 gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor={searchId}>{t("search")}</Label>
            <Hint>{t("searchHint")}</Hint>
            <span id={searchHint} hidden>
              {t("searchHint")}
            </span>
            {query.trim() && (
              <span aria-live="polite" className="ms-auto text-xs font-medium">
                {t("found", { count: matches.length })}
              </span>
            )}
          </div>
          <Input
            id={searchId}
            type="search"
            value={query}
            aria-describedby={searchHint}
            placeholder="P5-18"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.length) {
                e.preventDefault();
                if (matches.length === 1) select(matches[0]);
                else fitTo(matches);
              }
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${searchId}-switch`}>{t("switch")}</Label>
          <Select value={switchNo === null ? ALL : String(switchNo)} onValueChange={(v) => setSwitchNo(v === ALL ? null : Number(v))}>
            <SelectTrigger id={`${searchId}-switch`} className="w-48 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allSwitches")}</SelectItem>
              {plan.switches.map((s) => (
                <SelectItem key={s.number} value={String(s.number)}>
                  {s.asset ? t("switchOptionNamed", { number: s.number, name: s.asset.name }) : t("switchOption", { number: s.number })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-9 items-center gap-2">
          <Switch id={problemsId} checked={showProblems} onCheckedChange={setShowProblems} />
          <Label htmlFor={problemsId}>{t("showProblems")}</Label>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => setPlacing({})}>
            <Plus />
            {t("addOutlet")}
          </Button>
          {upload}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("more")}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog("settings")}>
                <Settings2 />
                {t("settings")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("replace")}>
                <Upload />
                {t("replaceDrawing")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/floor-plans/${plan.id}/export`} download>
                  <Download />
                  {t("export")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/floor-plans/${plan.id}/drawing`} download>
                  <Download />
                  {t("download")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
          <div className="flex flex-wrap items-center gap-2">
            {svg && (
              <>
                <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as "3d" | "top")} aria-label={t("view")}>
                  <ToggleGroupItem value="3d">
                    <Box />
                    {t("view3d")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="top">
                    <Square />
                    {t("viewTop")}
                  </ToggleGroupItem>
                </ToggleGroup>
                <div className="flex items-center gap-2">
                  <Switch id={`${problemsId}-focus`} checked={networkOnly} onCheckedChange={setNetworkOnly} />
                  <Label htmlFor={`${problemsId}-focus`}>{t("networkOnly")}</Label>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPlacing({ rack: true })}>
                  <Server />
                  {t("placeRack")}
                </Button>
              </>
            )}
            <div role="group" aria-label={t("zoom")} className={cn("flex items-center gap-1", svg && "hidden")}>
              <Button variant="outline" size="icon" disabled={zoom === ZOOMS[0]} onClick={() => zoomBy(-1)} aria-label={t("zoomOut")}>
                <ZoomOut />
              </Button>
              <span className="w-14 text-center text-sm tabular-nums" aria-label={t("zoomLevel", { percent: format.number(zoom * 100) })}>
                {format.number(zoom * 100)}%
              </span>
              <Button variant="outline" size="icon" disabled={zoom === ZOOMS.at(-1)} onClick={() => zoomBy(1)} aria-label={t("zoomIn")}>
                <ZoomIn />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => fitTo(outlets)} disabled={!outlets.length}>
              <Maximize />
              {t("fit")}
            </Button>
            {placing ? (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-primary">
                {placing.rack ? t("rackHint") : placing.move ? t("moveHint", { label: label(placing.move) }) : t("placeHint")}
                <Button variant="outline" size="sm" onClick={() => setPlacing(null)}>
                  <X />
                  {t("cancelPlacing")}
                </Button>
              </p>
            ) : (
              <Hint label={t("howTo")}>{svg ? t(view === "3d" ? "hint3d" : "hintTop") : t("mapHint")}</Hint>
            )}
          </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* The plan stays in view beside the side panel as that scrolls. */}
        <section ref={map} className="min-w-0 lg:sticky lg:self-start" style={{ top: stickyTop, ["--map-height" as string]: `calc(100dvh - ${stickyTop + 16}px)` }}>
          {svg ? (
            model ? (
              <Plan3D
                model={model}
                roles={roles}
                outlets={outlets.map((o) => ({ id: o.id, x: o.x, y: o.y, label: label(o), panel: o.panel, panelPort: o.panelPort, switchNo: o.switchNo, switchPort: o.switchPort, look: look(o) }))}
                rack={rack}
                units={[
                  ...plan.panels.map((n) => ({ kind: "panel" as const, number: n, picked: panelNo === n || current?.panel === n })),
                  ...plan.switches.map((w) => ({ kind: "switch" as const, number: w.number, status: w.asset?.monitorStatus ?? null, picked: switchNo === w.number || current?.switchNo === w.number })),
                ]}
                traced={traced}
                view={view}
                focus={networkOnly}
                placing={!!placing}
                focusOn={focus}
                fitRequest={fitRequest}
                label={t("mapLabel", { name: plan.name })}
                className="h-[70vh] lg:h-[var(--map-height)]"
                noWebGl={t("noWebGl")}
                // A second click on the chosen outlet lets it go, and its cable with it.
                onPickOutlet={(id) => setSelected(selected === id ? null : id)}
                onPickNothing={clearSelection}
                onPickUnit={(u) => {
                  setSelected(null);
                  if (u.kind === "panel") setPanelNo(panelNo === u.number ? null : u.number);
                  else setSwitchNo(switchNo === u.number ? null : u.number);
                }}
                onPlace={place}
              />
            ) : bytes ? (
              <p className="rounded-xl border p-6 text-sm text-destructive">{t("unreadable")}</p>
            ) : (
              <Skeleton className="h-[70vh] w-full rounded-xl" />
            )
          ) : (
          <PdfPage doc={doc} page={1} label={t("mapLabel", { name: plan.name })} zoom={zoom} onZoom={zoomBy} onDrawn={onDrawn} pan tall>
            <div className="absolute inset-0">
              {outlets.map((o) => {
                const inSwitch = switchNo !== null && o.switchNo === switchNo;
                const found = hit.has(o.id);
                const problem = showProblems && o.problems.length > 0;
                return (
                  <button
                    key={o.id}
                    type="button"
                    data-outlet={o.id}
                    aria-label={t("outletLabel", { label: label(o) })}
                    aria-pressed={o.id === selected}
                    onClick={() => setSelected(o.id)}
                    className={cn(
                      "absolute rounded-[2px] border border-primary/40 bg-primary/5 transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      inSwitch && "border-warning bg-warning/25",
                      problem && "border-2 border-dashed border-danger bg-danger/10",
                      found && "border-2 border-danger bg-danger/30",
                      o.id === selected && "border-2 border-primary bg-primary/25 ring-2 ring-primary ring-offset-1",
                      filtering && !found && !inSwitch && o.id !== selected && "opacity-30",
                    )}
                    style={{ left: `${(o.x - markW / 2) * 100}%`, top: `${(o.y - markH / 2) * 100}%`, width: `${markW * 100}%`, height: `${markH * 100}%` }}
                  />
                );
              })}
              {placing && (
                <button
                  type="button"
                  aria-label={t("placeLabel")}
                  className="absolute inset-0 z-10 cursor-crosshair bg-primary/5"
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    place({ x: clamp((e.clientX - box.left) / box.width, 0, 1), y: clamp((e.clientY - box.top) / box.height, 0, 1) });
                  }}
                />
              )}
            </div>
          </PdfPage>
          )}
        </section>

        <aside className="min-w-0 space-y-4">
          {current ? (
            <OutletCard
              plan={plan}
              outlet={current}
              onClose={() => setSelected(null)}
              onEdit={() => setEditing(current)}
              onMove={() => setPlacing({ move: current })}
              onSwitch={(n) => setSwitchNo(n)}
            />
          ) : null}
          {query.trim() && matches.length > 0 && (
            <OutletList title={t("results")} outlets={matches} selected={selected} onSelect={select} label={label} />
          )}
          <RackPanel plan={plan} panelNo={panelNo} switchNo={switchNo} onPanel={(n) => (setSelected(null), setPanelNo(n))} onSwitch={(n) => (setSelected(null), setSwitchNo(n))} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>{t("outlets", { count: outlets.length })}</p>
              <div className="space-y-1">
                <h3 className="font-medium">{t("toCheck")}</h3>
                {problemOutlets.length ? (
                  <>
                    <p className="text-muted-foreground">{t("toCheckCount", { count: problemOutlets.length })}</p>
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                      {problemOutlets.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => select(o)} className={cn("w-full rounded px-1 text-start hover:bg-muted", o.id === selected && "bg-muted")}>
                            <span dir="ltr" className="font-mono">
                              {label(o)}
                            </span>{" "}
                            <span className="text-muted-foreground">{t(`problems.${o.problems[0]}`, { written: o.written })}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("allGood")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {adding && <OutletDialog plan={plan} at={adding} onClose={() => setAdding(null)} onSaved={setSelected} />}
      {editing && <OutletDialog plan={plan} outlet={editing} onClose={() => setEditing(null)} />}
      {dialog === "settings" && <PlanSettingsDialog plan={plan} roles={model ? roles : null} onClose={() => setDialog(null)} />}
      {dialog === "replace" && <UploadDialog plan={plan} onClose={() => setDialog(null)} onSaved={() => setDrawn(false)} />}
    </div>
  );
}

function OutletList({ title, outlets, selected, onSelect, label }: { title: string; outlets: Outlet[]; selected: number | null; onSelect: (o: Outlet) => void; label: (o: Outlet) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto text-sm">
          {outlets.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => onSelect(o)} className={cn("w-full rounded px-1 text-start hover:bg-muted", o.id === selected && "bg-muted")}>
                <span dir="ltr" className="font-mono">
                  {label(o)}
                </span>
                {(o.room || o.assetName) && <span className="text-muted-foreground"> · {[o.room, o.assetName].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** What an outlet is wired and patched to, what is plugged in, and what to look at in it. */
function OutletCard({
  plan,
  outlet,
  onClose,
  onEdit,
  onMove,
  onSwitch,
}: {
  plan: FloorPlan;
  outlet: Outlet;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onSwitch: (n: number) => void;
}) {
  const t = useTranslations("floorPlan");
  const sw = plan.switches.find((s) => s.number === outlet.switchNo) ?? null;
  const port = (n: number | null) => (n === null ? t("noPort") : String(n));
  return (
    <Card aria-live="polite">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-base">
          <span dir="ltr" className="font-mono">
            {outletName(outlet) || t("unlabelled")}
          </span>
        </CardTitle>
        <Button variant="ghost" size="icon" className="-mt-1 -me-2 size-8" onClick={onClose} aria-label={t("close")}>
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">{t("panel")}</dt>
          <dd>{outlet.panel === null ? "—" : t("panelValue", { panel: outlet.panel, port: port(outlet.panelPort) })}</dd>
          <dt className="text-muted-foreground">{t("switchNo")}</dt>
          <dd className="space-y-1">
            <p>{outlet.switchNo === null ? "—" : t("switchValue", { number: outlet.switchNo, port: port(outlet.switchPort) })}</p>
            {sw?.asset ? (
              <p className="flex flex-wrap items-center gap-2">
                <Link href={`/assets/${sw.asset.id}`} className="font-medium hover:text-primary">
                  {sw.asset.name}
                </Link>
                <EnumBadge kind="deviceStatus" value={sw.asset.monitorStatus} />
              </p>
            ) : (
              outlet.switchNo !== null && <p className="text-muted-foreground">{t("notLinked")}</p>
            )}
          </dd>
          <dt className="text-muted-foreground">{t("room")}</dt>
          <dd dir="auto">{outlet.room || "—"}</dd>
          <dt className="text-muted-foreground">{t("device")}</dt>
          <dd>
            {outlet.assetId ? (
              <Link href={`/assets/${outlet.assetId}`} className="font-medium hover:text-primary">
                {outlet.assetName}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          {outlet.note && (
            <>
              <dt className="text-muted-foreground">{t("note")}</dt>
              <dd dir="auto" className="whitespace-pre-line">
                {outlet.note}
              </dd>
            </>
          )}
        </dl>
        {outlet.problems.length > 0 && (
          <ul className="space-y-0.5 text-danger">
            {outlet.problems.map((p) => (
              <li key={p}>{t(`problems.${p}`, { written: outlet.written })}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil />
            {t("edit")}
          </Button>
          <Button size="sm" variant="outline" onClick={onMove}>
            <Move />
            {t("move")}
          </Button>
          {outlet.switchNo !== null && (
            <Button size="sm" variant="ghost" onClick={() => onSwitch(outlet.switchNo!)}>
              {t("sameSwitch", { number: outlet.switchNo })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
