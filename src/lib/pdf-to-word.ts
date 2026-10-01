import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { buildDocx, type WordBlock, type WordParagraph, type WordRun, type WordSection } from "./docx";

/**
 * A PDF turned into an editable Word document. A PDF only knows where each piece of text sits
 * on the page, so this rebuilds what Word needs from that: lines from text sharing a baseline,
 * paragraphs from lines that follow on, headings from larger text, columns as tab stops, and
 * pictures where they stood. It runs in the browser with pdf.js; the layout part is plain code.
 */

export type FontInfo = { name: string; bold: boolean; italic: boolean };
/** A piece of text as the page shows it: x from the left, y its baseline from the top, in points. */
export type TextBit = { text: string; x: number; y: number; width: number; size: number; font: FontInfo };
/** A picture's box as the page shows it, from the top left, in points. */
export type Box = { x: number; y: number; width: number; height: number };
export type PictureBit = Box & { bytes: Uint8Array; type: "image/png" | "image/jpeg" };
export type PageContent = { width: number; height: number; texts: TextBit[]; pictures: PictureBit[] };

export type WordOptions = { pageBreaks: boolean };

// ---------------------------------------------------------------- reading the PDF

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const RTL_ALL = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LTR_ALL = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g;
/** Ligatures (ﬁ) and Arabic letters stored in their joined shapes, back to plain letters. */
const PRESENTATION = /[ﬀ-ﬆﭐ-﷿ﹰ-﻿]+/g;
const plain = (text: string) => text.replace(PRESENTATION, (s) => s.normalize("NFKC"));

/** A font's family as Word knows it: "ABCDEF+TimesNewRomanPS-BoldMT" is "Times New Roman". */
export function familyOf(name: string, fallback: string) {
  const base = name
    .replace(/^[A-Z]{6}\+/, "")
    .split(/[-,]/)[0]
    .replace(/(PS)?MT$|PS$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^Deja Vu\b/, "DejaVu")
    .trim();
  const known: Record<string, string> = { Helvetica: "Arial", Times: "Times New Roman", "Times Roman": "Times New Roman", Courier: "Courier New" };
  if (base && !/^(g_|Type3|Symbol|Zapf)/i.test(base)) return known[base] ?? base;
  return fallback === "serif" ? "Times New Roman" : fallback === "monospace" ? "Courier New" : "Arial";
}

type Matrix = number[];
type PdfLib = { OPS: Record<string, number>; Util: { transform: (a: Matrix, b: Matrix) => Matrix } };

/** Where each picture on the page is drawn, following the drawing's transforms. */
export function pictureBoxes(ops: { fnArray: number[]; argsArray: unknown[] }, lib: PdfLib, view: Matrix): Box[] {
  const { OPS, Util } = lib;
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const boxes: Box[] = [];
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args as Matrix);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0])) ctm = Util.transform(ctm, args[0] as Matrix);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const m = Util.transform(view, ctm);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      boxes.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    }
  });
  return boxes;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * The pictures worth keeping: on the page, not tiny, overlapping ones as one, and none that text
 * is written over (a background or a letterhead), unless the page has no text at all (a scan).
 */
export function keptPictures(boxes: Box[], texts: TextBit[], page: { width: number; height: number }): Box[] {
  const clipped = boxes
    .map((b) => {
      const x = Math.max(0, b.x);
      const y = Math.max(0, b.y);
      return { x, y, width: Math.min(page.width, b.x + b.width) - x, height: Math.min(page.height, b.y + b.height) - y };
    })
    .filter((b) => b.width >= 12 && b.height >= 12);
  const merged: Box[] = [];
  for (const box of clipped) {
    const hit = merged.find((m) => overlaps(m, box));
    if (!hit) merged.push({ ...box });
    else {
      const x = Math.min(hit.x, box.x);
      const y = Math.min(hit.y, box.y);
      hit.width = Math.max(hit.x + hit.width, box.x + box.width) - x;
      hit.height = Math.max(hit.y + hit.height, box.y + box.height) - y;
      hit.x = x;
      hit.y = y;
    }
  }
  if (texts.length === 0) return merged;
  return merged.filter((box) => {
    const inside = texts.filter((t) => t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height).reduce((n, t) => n + t.text.length, 0);
    return inside < 20;
  });
}

/**
 * Each page's text, fonts and pictures, as the page is shown (turned pages included).
 * `pictures` turns boxes into image files; without it pictures are left out.
 */
export async function readPdf(
  doc: PDFDocumentProxy,
  lib: PdfLib,
  options: {
    /** Turns boxes into image files; `scan` says the page has no text, only pictures. */
    pictures?: (page: PDFPageProxy, boxes: Box[], scan: boolean) => Promise<PictureBit[]>;
    onPage?: (done: number, total: number) => void;
  } = {},
): Promise<PageContent[]> {
  const pages: PageContent[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    // The operator list loads the fonts, so their names and styles can be read.
    const ops = await page.getOperatorList();
    const content = await page.getTextContent();
    const texts: TextBit[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const m = lib.Util.transform(view.transform, item.transform);
      const size = Math.hypot(m[2], m[3]);
      if (size < 1) continue;
      const style = content.styles[item.fontName];
      const loaded = page.commonObjs.has(item.fontName) ? (page.commonObjs.get(item.fontName) as { name?: string; bold?: boolean; italic?: boolean; black?: boolean }) : null;
      const name = loaded?.name ?? "";
      texts.push({
        text: plain(item.str),
        x: m[4],
        y: m[5],
        width: item.width,
        size,
        font: {
          name: familyOf(name, style?.fontFamily ?? "sans-serif"),
          bold: !!(loaded?.bold || loaded?.black) || /bold|black|heavy|semibold|demi/i.test(name),
          italic: !!loaded?.italic || /italic|oblique/i.test(name),
        },
      });
    }
    const boxes = keptPictures(pictureBoxes(ops, lib, view.transform), texts, view);
    const pictures = boxes.length && options.pictures ? await options.pictures(page, boxes, texts.length === 0) : [];
    pages.push({ width: view.width, height: view.height, texts, pictures });
    page.cleanup();
    options.onPage?.(n, doc.numPages);
  }
  return pages;
}

// ---------------------------------------------------------------- rebuilding the layout

type Line = { bits: TextBit[]; parts: { bit: TextBit; before: string }[]; y: number; x0: number; x1: number; size: number; rtl: boolean; tabs: number[] };
type Para = { lines: Line[]; size: number; rtl: boolean; top: number; bottom: number };

const roundSize = (size: number) => Math.round(size * 2) / 2;

/** The size most of the text is written in. */
function bodySize(pages: PageContent[]) {
  const counts = new Map<number, number>();
  for (const t of pages.flatMap((p) => p.texts)) counts.set(roundSize(t.size), (counts.get(roundSize(t.size)) ?? 0) + t.text.length);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
}

type RawLine = { bits: TextBit[]; y: number; x0: number; x1: number; size: number; rtl: boolean };

/** Text sharing a baseline, in reading order: right to left when most of its letters are. */
function rawLines(texts: TextBit[]): RawLine[] {
  const sorted = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TextBit[][] = [];
  for (const t of sorted) {
    const group = groups.at(-1);
    const ref = group?.[0];
    if (group && ref && Math.abs(t.y - ref.y) <= 0.4 * Math.min(t.size, ref.size)) group.push(t);
    else groups.push([t]);
  }
  return groups.map((bits) => {
    const rtlChars = bits.reduce((n, b) => n + (b.text.match(RTL_ALL)?.length ?? 0), 0);
    const ltrChars = bits.reduce((n, b) => n + (b.text.match(LTR_ALL)?.length ?? 0), 0);
    const rtl = rtlChars > ltrChars;
    return {
      bits: [...bits].sort((a, b) => (rtl ? b.x + b.width - (a.x + a.width) : a.x - b.x)),
      y: Math.max(...bits.map((b) => b.y)),
      x0: Math.min(...bits.map((b) => b.x)),
      x1: Math.max(...bits.map((b) => b.x + b.width)),
      size: Math.max(...bits.map((b) => b.size)),
      rtl,
    };
  });
}

/** Where a piece of text starts in its line's direction: its left edge, or its right edge. */
const edge = (bit: TextBit, rtl: boolean) => (rtl ? bit.x + bit.width : bit.x);
const NEAR = 2.5;

/** The gaps between a line's pieces of text, in reading order. */
const gapsOf = (line: RawLine) => line.bits.slice(1).map((bit, b) => (line.rtl ? line.bits[b].x - (bit.x + bit.width) : bit.x - (line.bits[b].x + line.bits[b].width)));

/**
 * Columns of a table: places where text starts at the same x in three or more lines in a row.
 * Each column must also be marked out in at least two of those lines by a gap wider than a space
 * and well wider than the line's word gaps, so the stretched spaces of ordinary text never count.
 * Each line in such a row of lines gets the columns it is part of.
 */
function tableColumns(lines: RawLine[]) {
  const columns = new Map<RawLine, number[]>();
  const rtl = (l: RawLine) => l.rtl;
  // Places where text starts after a column's gap, with the lines that mark each.
  const marked: { at: number; rtl: boolean; lines: Set<RawLine> }[] = [];
  for (const line of lines) {
    const gaps = gapsOf(line);
    const spaces = gaps.filter((g) => g > 0 && g < line.size).sort((a, b) => a - b);
    const usual = spaces.length ? spaces[Math.floor(spaces.length / 2)] : 0;
    line.bits.slice(1).forEach((bit, b) => {
      if (gaps[b] < bit.size * 0.35 || gaps[b] < usual * 1.8) return;
      const at = edge(bit, line.rtl);
      const found = marked.find((m) => m.rtl === line.rtl && Math.abs(m.at - at) <= NEAR);
      if (found) found.lines.add(line);
      else marked.push({ at, rtl: line.rtl, lines: new Set([line]) });
    });
  }
  const startsAt = (line: RawLine, at: number) => line.bits.slice(1).some((bit) => Math.abs(edge(bit, line.rtl) - at) <= NEAR);
  for (const column of marked.filter((m) => m.lines.size >= 2)) {
    // Lines in a row that start text there, close together and alike.
    let row: RawLine[] = [];
    const close = () => {
      if (row.length >= 3) for (const line of row) columns.set(line, [...(columns.get(line) ?? []), column.at]);
      row = [];
    };
    for (const line of lines) {
      const prev = row.at(-1);
      const follows = prev && rtl(prev) === rtl(line) && Math.abs(prev.size - line.size) <= prev.size * 0.15 && line.y - prev.y <= line.size * 3;
      if (!follows) close();
      if (rtl(line) === column.rtl && startsAt(line, column.at)) row.push(line);
      else close();
    }
    close();
  }
  for (const [line, at] of columns) columns.set(line, [...new Set(at)].sort((a, b) => (line.rtl ? b - a : a - b)));
  return columns;
}

/** A line's text in reading order, with spaces where words part and tabs where columns do. */
function finish(line: RawLine, columns: number[] | undefined, margin: number, pageWidth: number): Line {
  const { rtl } = line;
  // Tab stops are measured from the margin the line starts at: the right one for right to left.
  const stop = (at: number) => Math.max(0, rtl ? pageWidth - margin - at : at - margin);
  const parts: Line["parts"] = [];
  const tabs: number[] = columns ? columns.map(stop) : [];
  // A row whose first cells are empty starts in a later column.
  let column = columns?.findIndex((c) => Math.abs(c - edge(line.bits[0], rtl)) <= NEAR) ?? -1;
  line.bits.forEach((bit, i) => {
    const prev = line.bits[i - 1];
    let before = "";
    if (prev) {
      const gap = rtl ? prev.x - (bit.x + bit.width) : bit.x - (prev.x + prev.width);
      const at = columns?.findIndex((c) => Math.abs(c - edge(bit, rtl)) <= NEAR) ?? -1;
      if (at > column && gap > 0) {
        before = "\t".repeat(at - column);
        column = at;
      } else if (!columns && gap > Math.max(bit.size, prev.size) * 1.5) {
        before = "\t";
        tabs.push(stop(edge(bit, rtl)));
      } else if (gap > Math.min(bit.size, prev.size) * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(bit.text)) before = " ";
    }
    parts.push({ bit, before });
  });
  return { ...line, parts, tabs };
}

/** Lines that follow on from each other, as paragraphs. */
function paragraphs(page: Line[], right: number, left: number): Para[] {
  const paras: Para[] = [];
  for (const line of page) {
    const para = paras.at(-1);
    const prev = para?.lines.at(-1);
    const continues =
      para &&
      prev &&
      !prev.tabs.length &&
      !line.tabs.length &&
      line.rtl === prev.rtl &&
      Math.abs(line.size - para.size) <= para.size * 0.15 &&
      line.y - prev.y > 0 &&
      line.y - prev.y <= line.size * 1.8 &&
      // The line before reached the far side, so the text wrapped rather than ended.
      (prev.rtl ? prev.x0 <= left + line.size * 4 : prev.x1 >= right - line.size * 4) &&
      // Starts where the paragraph's other lines start (the first may be indented).
      (prev.rtl
        ? Math.abs(line.x1 - prev.x1) <= line.size * 1.5 || (para.lines.length === 1 && prev.x1 < line.x1 && line.x1 - prev.x1 <= line.size * 4)
        : Math.abs(line.x0 - prev.x0) <= line.size * 1.5 || (para.lines.length === 1 && prev.x0 > line.x0 && prev.x0 - line.x0 <= line.size * 4));
    if (continues) {
      para.lines.push(line);
      para.bottom = line.y;
    } else paras.push({ lines: [line], size: line.size, rtl: line.rtl, top: line.y, bottom: line.y });
  }
  return paras;
}

/** Runs of text in one style: font, size, bold, italic and direction. */
function runsOf(para: Para): WordRun[] {
  const runs: WordRun[] = [];
  para.lines.forEach((line, l) => {
    line.parts.forEach(({ bit, before }, i) => {
      // Lines of a paragraph join with a space, or nothing after a hyphen.
      const join = l > 0 && i === 0 ? (/[-­]$/.test(runs.at(-1)?.text ?? "") ? "" : " ") : before;
      const run: WordRun = { text: bit.text, size: roundSize(bit.size), font: bit.font.name, bold: bit.font.bold, italic: bit.font.italic, rtl: RTL.test(bit.text) };
      const last = runs.at(-1);
      if (last && last.size === run.size && last.font === run.font && !!last.bold === !!run.bold && !!last.italic === !!run.italic && !!last.rtl === !!run.rtl) {
        last.text += join + run.text;
      } else {
        // The space or tab before a change of style stays with the text before it.
        if (last) last.text += join;
        runs.push(run);
      }
    });
  });
  return runs;
}

/** The margins: where the text starts, within reason. */
function marginOf(pages: PageContent[]) {
  const xs = pages.flatMap((p) => p.texts.map((t) => t.x)).sort((a, b) => a - b);
  const left = xs[Math.floor(xs.length * 0.02)] ?? 72;
  return Math.min(108, Math.max(18, left));
}

/** The pages as Word sections and blocks: a section for each change of page size. */
export function layoutPages(pages: PageContent[], options: WordOptions): WordSection[] {
  const body = bodySize(pages);
  const margin = marginOf(pages);
  const sections: WordSection[] = [];

  pages.forEach((page, p) => {
    const current = sections.at(-1);
    const newSection = !current || Math.abs(current.width - page.width) > 1 || Math.abs(current.height - page.height) > 1;
    const section: WordSection = newSection ? { width: page.width, height: page.height, margin, blocks: [] } : current;
    if (newSection) sections.push(section);
    const textWidth = page.width - margin * 2;
    const raw = rawLines(page.texts);
    const left = Math.min(...raw.map((l) => l.x0), page.width);
    const right = Math.max(...raw.map((l) => l.x1), 0);
    const columns = tableColumns(raw);
    const pageLines = raw.map((line) => finish(line, columns.get(line), margin, page.width));
    const centre = page.width / 2;

    const blocks: { top: number; block: WordBlock; bottom: number }[] = [];
    for (const para of paragraphs(pageLines, right, left)) {
      const first = para.lines[0];
      const rest = para.lines.slice(1);
      const lineSpacing = rest.length ? Math.min(2.5, Math.max(1, (para.bottom - first.y) / rest.length / (para.size * 1.15))) : undefined;
      const centred =
        para.lines.every((l) => Math.abs((l.x0 + l.x1) / 2 - centre) <= Math.max(l.size, page.width * 0.03)) && first.x0 - margin > first.size * 2 && !first.tabs.length;
      // Every line but the last reaches both sides.
      const justified =
        !centred && rest.length > 0 && para.lines.slice(0, -1).every((l) => (para.rtl ? l.x0 - left : right - l.x1) <= l.size * 0.5) && para.lines.length >= 2;
      const block: WordParagraph = {
        kind: "paragraph",
        runs: runsOf(para),
        rtl: para.rtl || undefined,
        heading: para.size >= body * 1.5 ? 1 : para.size >= body * 1.2 ? 2 : undefined,
        align: centred ? "center" : justified ? "both" : undefined,
        lineSpacing: lineSpacing && Math.abs(lineSpacing - 1) > 0.08 ? Math.round(lineSpacing * 100) / 100 : undefined,
        tabs: first.tabs.length ? first.tabs : undefined,
      };
      if (!centred && !para.rtl) {
        const indent = Math.min(...para.lines.map((l) => l.x0)) - margin;
        if (indent > 3) block.indent = Math.min(indent, textWidth * 0.8);
        const firstLine = first.x0 - Math.min(...para.lines.map((l) => l.x0));
        if (rest.length && Math.abs(firstLine) > 3) block.firstLine = firstLine;
      }
      // The paragraph's box: from the top of its first line to below its last.
      blocks.push({ top: para.top - para.size * 0.95, bottom: para.bottom + para.size * 0.25, block });
    }
    for (const pic of page.pictures) {
      const scale = Math.min(1, textWidth / pic.width);
      const width = pic.width * scale;
      const centred = Math.abs(pic.x + pic.width / 2 - centre) <= page.width * 0.05;
      blocks.push({
        top: pic.y,
        bottom: pic.y + pic.height,
        block: {
          kind: "picture",
          bytes: pic.bytes,
          type: pic.type,
          width,
          height: pic.height * scale,
          align: centred ? "center" : undefined,
          indent: !centred && pic.x - margin > 3 ? Math.min(pic.x - margin, textWidth - width) : undefined,
        },
      });
    }
    blocks.sort((a, b) => a.top - b.top);

    // Space above each block, from the gap the page leaves; the first from the top margin when it
    // starts the page.
    let previousBottom: number | null = p === 0 || options.pageBreaks || newSection ? margin : null;
    blocks.forEach(({ top, bottom, block }, i) => {
      if (previousBottom !== null && top - previousBottom > 2) block.spaceBefore = Math.round(Math.min(top - previousBottom, 72));
      previousBottom = Math.max(previousBottom ?? 0, bottom);
      // A new page starts with its first block, unless a new section already does.
      if (i === 0 && p > 0 && options.pageBreaks && !newSection) block.pageBreakBefore = true;
      section.blocks.push(block);
    });
    if (blocks.length === 0 && options.pageBreaks && p > 0 && !newSection) section.blocks.push({ kind: "paragraph", runs: [], pageBreakBefore: true });
  });
  return sections;
}

/** Pages that have no text to edit, only pictures: scans. */
export const scannedPages = (pages: PageContent[]) => pages.flatMap((p, i) => (p.texts.length === 0 ? [i + 1] : []));

/** The PDF's pages as a .docx file. */
export function pagesToDocx(pages: PageContent[], title: string, options: WordOptions) {
  return buildDocx({ title, sections: layoutPages(pages, options) });
}
