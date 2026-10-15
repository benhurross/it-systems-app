"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FileCode2, FileText, Printer, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AssetsHeader } from "@/components/assets/assets-header";
import { downloadBytes } from "@/components/tools/files";
import { PdfThumb, usePdfDocument } from "@/components/tools/pdf-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { useFormat } from "@/hooks/use-format";
import { useLookups } from "@/hooks/use-lookups";
import { Link } from "@/i18n/navigation";
import { api, ApiError, apiFile } from "@/lib/api";
import type { Asset, TagSetup } from "@/lib/api-types";
import { ref } from "@/lib/domain";

/** As many as the printer takes at once; the list shows this many at most, a search narrows it. */
const MOST = 500;
type Output = "printer" | "pdf" | "zpl";

/** Choosing assets and printing their tags: on the label printer, or as a PDF or a ZPL file. */
export default function AssetTagsPage() {
  const t = useTranslations("assets.tags");
  const format = useFormat();
  const lookups = useLookups();
  const ids = useId();
  const asked = useSearchParams().get("ids");
  const [selected, setSelected] = useState<number[]>(() => (asked ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const [untaggedOnly, setUntaggedOnly] = useState(!asked);
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState("1");
  const { data: assets, isLoading } = useApi<Asset[]>("/assets");
  const { data: setup } = useApi<TagSetup>("/assets/tags");

  const term = search.trim().toLowerCase();
  const matching = (assets ?? [])
    .filter((a) => a.status !== "retired" || selected.includes(a.id))
    .filter((a) => !untaggedOnly || !a.tagPrintedAt || selected.includes(a.id))
    .filter(
      (a) =>
        !term ||
        [ref("asset", a.id), a.name, a.serial ?? "", a.model ?? "", lookups.label("location", a.location)].some((v) => v.toLowerCase().includes(term)),
    );
  const shown = matching.slice(0, MOST);
  const allShown = shown.length > 0 && shown.every((a) => selected.includes(a.id));
  const toggle = (id: number, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const copiesNumber = Number(copies);
  const copiesValid = Number.isInteger(copiesNumber) && copiesNumber >= 1 && copiesNumber <= 10;

  // The first chosen tag as it will print.
  const first = selected[0] ?? null;
  const preview = useQuery({
    queryKey: ["tag-preview", first],
    queryFn: async () => new Uint8Array(await (await apiFile("/assets/tags", { ids: [first], copies: 1, output: "preview" })).arrayBuffer()),
    enabled: first !== null,
  });
  const doc = usePdfDocument(first !== null ? (preview.data ?? null) : null);

  const run = useMutation({
    mutationFn: async ({ output, tab }: { output: Output; tab: Window | null }) => {
      const body = { ids: selected, copies: copiesNumber, output };
      if (output === "printer") return { output, printed: (await api<{ printed: number }>("/assets/tags", { body })).printed, tab };
      return { output, file: await apiFile("/assets/tags", body), tab };
    },
    onSuccess: async (result) => {
      if (result.output === "printer") toast.success(t("sent", { count: result.printed }));
      else if (result.output === "pdf") {
        const url = URL.createObjectURL(result.file!);
        if (result.tab) result.tab.location.href = url;
        else downloadBytes("asset-tags.pdf", new Uint8Array(await result.file!.arrayBuffer()));
      } else downloadBytes("asset-tags.zpl", new Uint8Array(await result.file!.arrayBuffer()), "text/plain");
      setSelected([]);
    },
    onError: (error, { tab }) => {
      tab?.close();
      const message = error instanceof ApiError ? error.message : "";
      toast.error(message === "noPrinter" ? t("noPrinter") : message === "printerUnreachable" ? t("unreachable") : t("failed"));
    },
  });
  const go = (output: Output) => {
    // A tab opened now, while the click still counts, so the PDF can open in it when it is ready.
    const tab = output === "pdf" ? window.open("", "_blank") : null;
    run.mutate({ output, tab });
  };
  const ready = selected.length > 0 && selected.length <= MOST && copiesValid && !run.isPending;

  return (
    <>
      <AssetsHeader />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-4" aria-label={t("list")}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="ps-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id={`${ids}-untagged`} checked={untaggedOnly} onCheckedChange={setUntaggedOnly} />
              <Label htmlFor={`${ids}-untagged`} className="text-sm font-normal">
                {t("untaggedOnly")}
              </Label>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allShown}
                      onCheckedChange={(on) => setSelected((s) => (on ? [...new Set([...s, ...shown.map((a) => a.id)])].slice(0, MOST) : s.filter((id) => !shown.some((a) => a.id === id))))}
                      aria-label={t("selectAll")}
                      disabled={shown.length === 0}
                    />
                  </TableHead>
                  <TableHead>{t("tag")}</TableHead>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("location")}</TableHead>
                  <TableHead>{t("printed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : shown.map((a) => {
                      const tag = ref("asset", a.id);
                      return (
                        <TableRow key={a.id} data-state={selected.includes(a.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox checked={selected.includes(a.id)} onCheckedChange={(on) => toggle(a.id, on === true)} aria-label={t("select", { tag })} />
                          </TableCell>
                          <TableCell>
                            <Link href={`/assets/${a.id}`} className="font-mono text-primary hover:underline">
                              {tag}
                            </Link>
                          </TableCell>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>{lookups.label("location", a.location)}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{a.tagPrintedAt ? format.date(a.tagPrintedAt) : t("notPrinted")}</TableCell>
                        </TableRow>
                      );
                    })}
                {!isLoading && shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {untaggedOnly && !term ? t("allTagged") : t("empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {matching.length > shown.length && (
            <p className="text-sm text-muted-foreground">{t("limited", { shown: format.number(shown.length), total: format.number(matching.length) })}</p>
          )}
        </section>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>{t("selected", { count: selected.length })}</CardTitle>
            {setup && <CardDescription>{t("size", { width: format.number(setup.widthMm), height: format.number(setup.heightMm), dpi: setup.dpi })}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-5">
            <figure className="space-y-2">
              <div className="flex aspect-[2/1] items-center justify-center rounded-lg border bg-muted/40 p-3">
                {first === null ? (
                  <p className="text-center text-sm text-muted-foreground">{t("previewEmpty")}</p>
                ) : (
                  <PdfThumb doc={doc} page={1} size={256} label={t("preview", { tag: ref("asset", first) })} />
                )}
              </div>
            </figure>
            <div className="space-y-2">
              <Label htmlFor={`${ids}-copies`}>{t("copies")}</Label>
              <Input id={`${ids}-copies`} type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(e.target.value)} aria-invalid={!copiesValid || undefined} className="w-24" />
            </div>
            {selected.length > MOST && <p className="text-sm text-destructive">{t("tooMany", { most: format.number(MOST) })}</p>}
            <div className="grid gap-2">
              {setup?.printer && (
                <Button disabled={!ready} onClick={() => go("printer")}>
                  <Printer />
                  {t("print")}
                </Button>
              )}
              <Button variant={setup?.printer ? "outline" : "default"} disabled={!ready} onClick={() => go("pdf")}>
                <FileText />
                {t("pdf")}
              </Button>
              <Button variant="outline" disabled={!ready} onClick={() => go("zpl")}>
                <FileCode2 />
                {t("zpl")}
              </Button>
            </div>
            {setup && !setup.printer && <p className="text-sm text-muted-foreground">{t("noPrinter")}</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
