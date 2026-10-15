import { createConnection } from "node:net";
import { inArray } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import { type AssetLabel, type LabelLayout, layoutLabel, toPdf, toZpl } from "@/lib/labels";
import type { assetTagsInput } from "@/lib/schemas";
import { audit, type Actor } from "../audit";
import { db } from "../db";
import { assets } from "../db/schema";
import { badRequest, HttpError, notFound } from "../http";
import { getMailConfig } from "../mail/config";
import { getSetting } from "../settings";

/** How long the printer has to take the labels before it is reported as not answering. */
const PRINTER_TIMEOUT_MS = 8000;

/**
 * The address a tag's QR code leads to: the short /a/142, which opens the asset once signed in.
 * The app's address is the one emails use, or else the one the page was opened at.
 */
async function linkBase(origin: string) {
  const { appUrl } = await getMailConfig();
  return (appUrl || origin).replace(/\/+$/, "");
}

async function layoutsFor(ids: number[], origin: string): Promise<LabelLayout[]> {
  const [setting, base, rows] = await Promise.all([
    getSetting("labelPrinter"),
    linkBase(origin),
    db.select({ id: assets.id, name: assets.name, serial: assets.serial }).from(assets).where(inArray(assets.id, ids)),
  ]);
  if (rows.length !== new Set(ids).size) throw notFound();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const asset = byId.get(id)!;
    const label: AssetLabel = { ref: ref("asset", id), name: asset.name, serial: asset.serial, link: `${base}/a/${id}`, owner: setting.owner };
    return layoutLabel(label, setting);
  });
}

/** Sends ZPL to a networked Zebra printer on its raw port (9100 unless set otherwise). */
export function sendToPrinter(host: string, port: number, zpl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const fail = () => {
      socket.destroy();
      reject(new HttpError(502, "printerUnreachable"));
    };
    socket.setTimeout(PRINTER_TIMEOUT_MS, fail);
    socket.once("error", fail);
    socket.once("connect", () => socket.end(zpl, "latin1"));
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

export type TagOutput = { kind: "printed"; count: number } | { kind: "file"; bytes: Uint8Array; type: string; name: string; inline: boolean };

/**
 * Asset tags printed on the label printer, or made as a PDF (for a printer on a computer) or a
 * ZPL file. A preview is the first tag as a PDF, and is not counted as printed.
 */
export async function printTags(input: z.infer<typeof assetTagsInput>, origin: string, actor: Actor): Promise<TagOutput> {
  const ids = [...new Set(input.ids)];
  if (input.output === "preview") {
    return { kind: "file", bytes: await toPdf(await layoutsFor(ids.slice(0, 1), origin)), type: "application/pdf", name: "asset-tag-preview.pdf", inline: true };
  }
  const layouts = await layoutsFor(ids, origin);
  let output: TagOutput;
  if (input.output === "printer") {
    const { host, port } = await getSetting("labelPrinter");
    if (!host) throw badRequest("noPrinter");
    await sendToPrinter(host, port, toZpl(layouts, input.copies));
    output = { kind: "printed", count: ids.length * input.copies };
  } else if (input.output === "pdf") {
    output = { kind: "file", bytes: await toPdf(layouts, input.copies), type: "application/pdf", name: "asset-tags.pdf", inline: true };
  } else {
    output = { kind: "file", bytes: new TextEncoder().encode(toZpl(layouts, input.copies)), type: "text/plain; charset=utf-8", name: "asset-tags.zpl", inline: false };
  }

  await db.update(assets).set({ tagPrintedAt: new Date() }).where(inArray(assets.id, ids));
  const refs = ids.map((id) => ref("asset", id));
  const named = refs.length <= 5 ? refs.join(", ") : `${refs.slice(0, 5).join(", ")} and ${refs.length - 5} more`;
  const how = { printer: "on the label printer", pdf: "as a PDF", zpl: "as a ZPL file" }[input.output];
  await audit(actor, "print_tags", "asset", ids.length === 1 ? ids[0] : "many", `Printed tags for ${named} ${how}`);
  return output;
}

/** Whether tags can go straight to a label printer, and the label's size, without the printer's address. */
export async function tagSetup() {
  const { host, widthMm, heightMm, dpi } = await getSetting("labelPrinter");
  return { printer: host !== "", widthMm, heightMm, dpi };
}

/** A sample tag on the label printer, to check its address and the label size. */
export async function testPrint(origin: string, actor: Actor) {
  const setting = await getSetting("labelPrinter");
  if (!setting.host) throw badRequest("noPrinter");
  const base = await linkBase(origin);
  const sample = layoutLabel({ ref: "AST-0000", name: "Test tag", serial: null, link: `${base}/a/0`, owner: setting.owner }, setting);
  await sendToPrinter(setting.host, setting.port, toZpl([sample]));
  await audit(actor, "test_print", "settings", "labelPrinter", `Printed a test tag on ${setting.host}`);
}
