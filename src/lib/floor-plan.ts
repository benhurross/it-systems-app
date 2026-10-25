/**
 * The office's network outlets as a floor plan shows them: each wall point labelled with its patch
 * panel port over its switch port (P5-18 over S4-42, panel 5 port 18 to switch 4 port 42). The
 * labels are read from the drawing's own text, where each sits, so the plan needs no tracing by hand.
 */

/** A piece of text on the page, in points from its top left corner, as the PDF reader gives it. */
export type PlanText = { text: string; x: number; y: number; width: number; height: number };

/** A port label read: P or S, the panel's or switch's number and the port's (null when it has none). */
export type PortLabel = { kind: "P" | "S"; unit: number; port: number | null; written: string; cleaned: boolean };

/** An outlet as read from the drawing: where it is (fractions of the page) and its two ends. */
export type ReadOutlet = {
  panel: number | null;
  panelPort: number | null;
  switchNo: number | null;
  switchPort: number | null;
  x: number;
  y: number;
  /** The labels as the drawing has them, when tidied to be read ("S3-7`" read as S3-7). */
  written: string;
};

export type OutletProblem = "duplicatePanelPort" | "duplicateSwitchPort" | "noPanel" | "noSwitch" | "noPort" | "written";

/** Some drawings' fonts carry digits under the codes 0x11 to 0x1A instead of "0" to "9". */
const misplacedDigit = /[\u0011-\u001a]/g;
const LABEL = /^([PS])\s*(\d{1,3})\s*-\s*(\d{1,3})?(.*)$/i;

/** A label read, tidied of what keeps it from being one; null for text that is not a port label. */
export function readLabel(raw: string): PortLabel | null {
  const written = raw.replace(misplacedDigit, (c) => String(c.charCodeAt(0) - 0x11)).trim();
  const m = LABEL.exec(written);
  if (!m) return null;
  const [, kind, unit, port, rest] = m;
  // Only marks that are not letters or digits may trail a label: P4-12A is not one.
  if (/[\p{L}\p{N}]/u.test(rest)) return null;
  return { kind: kind.toUpperCase() as "P" | "S", unit: Number(unit), port: port === undefined ? null : Number(port), written, cleaned: rest.trim() !== "" };
}

export const panelLabel = (o: { panel: number | null; panelPort: number | null }) => (o.panel === null ? "" : `P${o.panel}-${o.panelPort ?? "?"}`);
export const switchLabel = (o: { switchNo: number | null; switchPort: number | null }) => (o.switchNo === null ? "" : `S${o.switchNo}-${o.switchPort ?? "?"}`);

/**
 * Text that runs on along one line, as "P4-" and "12" drawn one after the other, put back
 * together: pieces join when the gap between them is under a third of the text's height.
 */
function joined(texts: PlanText[]) {
  const sorted = texts.filter((t) => t.text.trim()).toSorted((a, b) => a.y - b.y || a.x - b.x);
  const out: PlanText[] = [];
  for (const t of sorted) {
    const last = out.at(-1);
    if (last && Math.abs(last.y - t.y) < last.height * 0.2 && t.x - (last.x + last.width) < last.height / 3 && t.x >= last.x) {
      out[out.length - 1] = { ...last, text: last.text + t.text, width: t.x + t.width - last.x };
    } else out.push({ ...t });
  }
  return out;
}

/**
 * The outlets on a page: each P label paired with the S label set just below it (or just above),
 * the pair's middle as the outlet's place. A label without its pair is an outlet with one end.
 */
export function readOutlets(texts: PlanText[], page: { width: number; height: number }) {
  const labels = joined(texts).flatMap((t) => {
    const label = readLabel(t.text);
    return label ? [{ ...t, label }] : [];
  });
  const panels = labels.filter((l) => l.label.kind === "P");
  const switches = labels.filter((l) => l.label.kind === "S");
  const used = new Set<number>();
  const outlets: ReadOutlet[] = [];
  for (const p of panels) {
    // The nearest S label stacked on it: lined up on the left, within two lines up or down.
    let best = -1;
    let gap = Infinity;
    switches.forEach((s, i) => {
      if (used.has(i)) return;
      const dy = Math.abs(s.y - p.y);
      if (Math.abs(s.x - p.x) > p.height * 0.8 || dy < p.height * 0.5 || dy > p.height * 2.2) return;
      if (dy < gap) {
        gap = dy;
        best = i;
      }
    });
    const s = best >= 0 ? switches[best] : null;
    if (s) used.add(best);
    outlets.push(outlet(p, s, page));
  }
  switches.forEach((s, i) => {
    if (!used.has(i)) outlets.push(outlet(null, s, page));
  });
  const heights = labels.map((l) => l.height).toSorted((a, b) => a - b);
  const widths = labels.map((l) => l.width).toSorted((a, b) => a - b);
  // The size a mark around an outlet is drawn at, in points: a little more than its two labels.
  const mark = labels.length
    ? { width: widths[Math.floor(widths.length / 2)] * 1.5, height: heights[Math.floor(heights.length / 2)] * 3 }
    : { width: 10, height: 9 };
  return { outlets: outlets.toSorted((a, b) => a.y - b.y || a.x - b.x), mark };
}

function outlet(p: (PlanText & { label: PortLabel }) | null, s: (PlanText & { label: PortLabel }) | null, page: { width: number; height: number }): ReadOutlet {
  const both = [p, s].filter((l) => l !== null);
  const left = Math.min(...both.map((l) => l.x));
  const right = Math.max(...both.map((l) => l.x + l.width));
  const top = Math.min(...both.map((l) => l.y));
  const bottom = Math.max(...both.map((l) => l.y + l.height));
  return {
    panel: p?.label.unit ?? null,
    panelPort: p?.label.port ?? null,
    switchNo: s?.label.unit ?? null,
    switchPort: s?.label.port ?? null,
    x: (left + right) / 2 / page.width,
    y: (top + bottom) / 2 / page.height,
    written: both.some((l) => l.label.cleaned) ? both.map((l) => l.label.written).join(" / ") : "",
  };
}

type Checked = { panel: number | null; panelPort: number | null; switchNo: number | null; switchPort: number | null; written: string };

/**
 * What to look at in a set of outlets, outlet by outlet (by index): a patch panel port or switch
 * port given to two outlets, an end or a port number missing, a label tidied to be read.
 */
export function outletProblems(outlets: Checked[]): OutletProblem[][] {
  const count = (key: (o: Checked) => string | null) => {
    const seen = new Map<string, number>();
    for (const o of outlets) {
      const k = key(o);
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return (o: Checked) => {
      const k = key(o);
      return k !== null && (seen.get(k) ?? 0) > 1;
    };
  };
  const panelTwice = count((o) => (o.panel !== null && o.panelPort !== null ? `${o.panel}-${o.panelPort}` : null));
  const switchTwice = count((o) => (o.switchNo !== null && o.switchPort !== null ? `${o.switchNo}-${o.switchPort}` : null));
  return outlets.map((o) => {
    const problems: OutletProblem[] = [];
    if (panelTwice(o)) problems.push("duplicatePanelPort");
    if (switchTwice(o)) problems.push("duplicateSwitchPort");
    if (o.panel === null) problems.push("noPanel");
    if (o.switchNo === null) problems.push("noSwitch");
    if ((o.panel !== null && o.panelPort === null) || (o.switchNo !== null && o.switchPort === null)) problems.push("noPort");
    if (o.written) problems.push("written");
    return problems;
  });
}

/** Whether an outlet answers a search: its labels (P5-18, S4-42, or just S4), its room or its device. */
export function outletMatches(o: Checked & { room: string; device?: string | null }, query: string) {
  const q = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!q) return false;
  const p = panelLabel(o);
  const s = switchLabel(o);
  if (/^[PS]\d+(-\d*)?$/.test(q)) {
    const label = q.startsWith("P") ? p : s;
    return q.includes("-") ? (q.endsWith("-") ? label.startsWith(q) : label === q) : label.split("-")[0] === q;
  }
  const words = query.trim().toLowerCase();
  return o.room.toLowerCase().includes(words) || (o.device ?? "").toLowerCase().includes(words) || o.written.toLowerCase().includes(words);
}

type Matrix = number[];
type PdfText = { str: string; transform: Matrix; width: number };
/** The bits of pdf.js a page's text is read with, so this file does not load pdf.js itself. */
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number; transform: Matrix };
  getTextContent: () => Promise<{ items: (PdfText | object)[] }>;
};

/** A page's text, level text only (labels lie flat; room names often run up the page), in points from the top left. */
export async function pageTexts(page: PdfPage, lib: { Util: { transform: (a: Matrix, b: Matrix) => Matrix } }) {
  const view = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const texts: PlanText[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = lib.Util.transform(view.transform, item.transform);
    if (Math.abs(b) > 0.01 * Math.abs(a) || Math.abs(c) > 0.01 * Math.abs(d) || a <= 0) continue;
    const height = Math.abs(d);
    texts.push({ text: item.str, x: e, y: f - height, width: item.width, height });
  }
  return { texts, size: { width: view.width, height: view.height } };
}
