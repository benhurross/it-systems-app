import { panelLabel, readLabel, readOutlets, switchLabel, type PlanText, type ReadOutlet } from "./floor-plan";

/**
 * A floor plan drawn as an SVG, as CAD programs export one: its lines layer by layer (walls,
 * doors, furniture), the room names and the outlets' labels, all in the drawing's own units from
 * its top left corner, after every transform. Read in the browser with its DOMParser; nothing of
 * the file is ever put into the page.
 */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** An SVG transform attribute as one matrix: matrix, translate, scale and rotate, in order. */
export function parseTransform(text: string | null): Matrix {
  let m = IDENTITY;
  if (!text) return m;
  for (const [, name, args] of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const n = (args.match(/-?[\d.]+(?:e-?\d+)?/gi) ?? []).map(Number);
    let t: Matrix = IDENTITY;
    if (name === "matrix" && n.length === 6) t = n as Matrix;
    else if (name === "translate") t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (name === "scale") t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (name === "rotate") {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === "skewX") t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === "skewY") t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, t);
  }
  return m;
}

/** A path's outline as straight pieces, x1 y1 x2 y2 each, in the path's own units; curves in short steps. */
export function pathSegments(d: string): number[] {
  const out: number[] = [];
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = "";
  let [x, y, sx, sy] = [0, 0, 0, 0];
  const num = () => Number(tokens[i++]);
  const line = (nx: number, ny: number) => {
    out.push(x, y, nx, ny);
    [x, y] = [nx, ny];
  };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        [x, y] = [ox + num(), oy + num()];
        [sx, sy] = [x, y];
        // Pairs after a move are lines.
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
        line(ox + num(), oy + num());
        break;
      case "H":
        line(ox + num(), y);
        break;
      case "V":
        line(x, oy + num());
        break;
      case "C": {
        const [x1, y1, x2, y2, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
        const [px, py] = [x, y];
        for (let s = 1; s <= 8; s++) {
          const t = s / 8;
          const u = 1 - t;
          line(u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
        }
        break;
      }
      case "Q": {
        const [x1, y1, ex, ey] = [ox + num(), oy + num(), ox + num(), oy + num()];
        const [px, py] = [x, y];
        for (let s = 1; s <= 6; s++) {
          const t = s / 6;
          const u = 1 - t;
          line(u * u * px + 2 * u * t * x1 + t * t * ex, u * u * py + 2 * u * t * y1 + t * t * ey);
        }
        break;
      }
      // Smooth curves and arcs, rare in plans, are drawn straight to where they end.
      case "S":
        i += 2;
        line(ox + num(), oy + num());
        break;
      case "T":
        line(ox + num(), oy + num());
        break;
      case "A":
        i += 5;
        line(ox + num(), oy + num());
        break;
      case "Z":
        if (x !== sx || y !== sy) line(sx, sy);
        cmd = "";
        break;
      default:
        i++;
    }
  }
  return out;
}

export type SvgLayer = { name: string; segments: number[] };
export type SvgRoom = { text: string; x: number; y: number };
export type SvgPlan = {
  width: number;
  height: number;
  layers: SvgLayer[];
  /** Room names, at their middle, in fractions of the plan. */
  rooms: SvgRoom[];
  outlets: ReadOutlet[];
  mark: { width: number; height: number };
};

/** How each layer is shown: raised as walls, as glass, or flat on the floor. */
export type LayerRole = "wall" | "glass" | "flat";

const SKIP = new Set(["defs", "clipPath", "mask", "style", "script", "symbol", "metadata", "title", "desc", "pattern", "marker"]);

/** A plan read from an SVG document. */
export function readSvgPlan(doc: Document): SvgPlan {
  const svg = doc.documentElement;
  if (!svg || svg.localName !== "svg") throw new Error("notSvg");
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const [vx, vy, width, height] =
    box.length === 4 && box.every(Number.isFinite) ? box : [0, 0, parseFloat(svg.getAttribute("width") ?? "0"), parseFloat(svg.getAttribute("height") ?? "0")];
  if (!(width > 0 && height > 0)) throw new Error("noSize");
  const base: Matrix = [1, 0, 0, 1, -vx, -vy];

  const layers = new Map<string, number[]>();
  const texts: (PlanText & { group: number })[] = [];
  const names: { text: string; x: number; y: number; h: number }[] = [];
  let textGroup = 0;

  const add = (layer: string, m: Matrix, local: number[]) => {
    const list = layers.get(layer) ?? layers.set(layer, []).get(layer)!;
    for (let k = 0; k < local.length; k += 4) {
      const [x1, y1] = apply(m, local[k], local[k + 1]);
      const [x2, y2] = apply(m, local[k + 2], local[k + 3]);
      if (x1 !== x2 || y1 !== y2) list.push(x1, y1, x2, y2);
    }
  };
  const n = (el: Element, name: string, fallback = 0) => {
    const v = parseFloat(el.getAttribute(name) ?? "");
    return Number.isFinite(v) ? v : fallback;
  };

  const walk = (el: Element, m: Matrix, layer: string) => {
    if (SKIP.has(el.localName) || el.getAttribute("display") === "none") return;
    const here = multiply(m, parseTransform(el.getAttribute("transform")));
    const id = el.getAttribute("id") ?? "";
    const named = el.getAttribute("data-layer") ?? (id.startsWith("layer-") ? id.slice(6) : null);
    const inLayer = el.localName === "g" && named ? named : layer;
    switch (el.localName) {
      case "path":
        add(inLayer, here, pathSegments(el.getAttribute("d") ?? ""));
        return;
      case "line":
        add(inLayer, here, [n(el, "x1"), n(el, "y1"), n(el, "x2"), n(el, "y2")]);
        return;
      case "polyline":
      case "polygon": {
        const p = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
        const local: number[] = [];
        for (let k = 2; k + 1 < p.length; k += 2) local.push(p[k - 2], p[k - 1], p[k], p[k + 1]);
        if (el.localName === "polygon" && p.length >= 4) local.push(p[p.length - 2], p[p.length - 1], p[0], p[1]);
        add(inLayer, here, local);
        return;
      }
      case "rect": {
        const [x, y, w, h] = [n(el, "x"), n(el, "y"), n(el, "width"), n(el, "height")];
        // The sheet behind the whole drawing is not part of it.
        if (Math.abs(x - vx) < 0.01 && Math.abs(y - vy) < 0.01 && Math.abs(w - width) < 0.01 && Math.abs(h - height) < 0.01) return;
        add(inLayer, here, [x, y, x + w, y, x + w, y, x + w, y + h, x + w, y + h, x, y + h, x, y + h, x, y]);
        return;
      }
      case "text": {
        const size = n(el, "font-size", 3);
        const lines: { text: string; x: number; y: number }[] = [];
        let [x, y] = [n(el, "x"), n(el, "y")];
        const spans = [...el.children].filter((c) => c.localName === "tspan");
        if (!spans.length) lines.push({ text: el.textContent ?? "", x, y });
        for (const span of spans) {
          if (span.hasAttribute("x")) x = n(span, "x");
          if (span.hasAttribute("y")) y = n(span, "y");
          y += n(span, "dy");
          lines.push({ text: span.textContent ?? "", x, y });
        }
        const [ax, ay] = [here[0], here[1]];
        const scale = Math.hypot(ax, ay);
        const level = Math.abs(ay) < 0.01 * scale && ax > 0;
        const group = textGroup++;
        const placed = lines
          .filter((l) => l.text.trim())
          .map((l) => {
            const [px, py] = apply(here, l.x, l.y);
            const h = size * scale;
            const w = l.text.trim().length * 0.55 * h;
            return { text: l.text.trim(), x: px, y: py - h * 0.8, width: w, height: h, group };
          });
        if (level) texts.push(...placed);
        // Lines that are not port labels name a room, read as one at their middle.
        const words = placed.filter((p) => !readLabel(p.text) && /\p{L}/u.test(p.text));
        if (words.length) {
          const cx = words.reduce((a, p) => a + p.x + p.width / 2, 0) / words.length;
          const cy = words.reduce((a, p) => a + p.y + p.height / 2, 0) / words.length;
          names.push({ text: words.map((p) => p.text).join(" "), x: cx, y: cy, h: words[0].height });
        }
        return;
      }
    }
    for (const child of el.children) walk(child, here, inLayer);
  };
  for (const child of svg.children) walk(child, base, "drawing");

  // A name set on two lines as two texts (PROJECT over MANAGER) is one name.
  const rooms: SvgRoom[] = [];
  const joined: typeof names = [];
  for (const r of names.toSorted((a, b) => a.y - b.y)) {
    const above = joined.find((j) => Math.abs(j.x - r.x) < 3 * r.h && r.y - j.y > 0 && r.y - j.y < 1.8 * r.h);
    if (above) Object.assign(above, { text: `${above.text} ${r.text}`, y: r.y });
    else joined.push({ ...r });
  }
  for (const r of joined) rooms.push({ text: r.text, x: r.x / width, y: r.y / height });
  const { outlets, mark } = readOutlets(texts, { width, height });
  return {
    width,
    height,
    layers: [...layers].map(([name, segments]) => ({ name, segments })).filter((l) => l.segments.length),
    rooms,
    outlets,
    mark,
  };
}

/**
 * How a layer is shown unless chosen otherwise: doors and furniture flat, glazing as glass, and the
 * layer with the most lines (the walls, whatever the drawing calls it) raised.
 */
export function defaultRoles(layers: Pick<SvgLayer, "name" | "segments">[]): Record<string, LayerRole> {
  const most = layers.toSorted((a, b) => b.segments.length - a.segments.length)[0]?.name;
  return Object.fromEntries(
    layers.map((l) => [
      l.name,
      /glaz|glass|curt/i.test(l.name) ? "glass" : /door|furn|الفرش|chair|desk|text|dim/i.test(l.name) ? "flat" : l.name === most || /wall|partition|جدار/i.test(l.name) ? "wall" : "flat",
    ]),
  );
}

type Placed = { panel: number | null; panelPort: number | null; switchNo: number | null; switchPort: number | null; x: number; y: number };
const key = (o: Placed) => `${panelLabel(o)} ${switchLabel(o)}`;

/**
 * The move that puts a plan's outlets onto a new drawing of the same floor, from the outlets
 * labelled alike on both (each label once on each): x' = a·x + b·y + c, y' = d·x + e·y + f, best
 * fitted. Null when fewer than four outlets match; `error` is how far off the worst match lands.
 */
export function fitOutlets(current: Placed[], read: Placed[]) {
  const once = (list: Placed[]) => {
    const seen = new Map<string, Placed | null>();
    for (const o of list) seen.set(key(o), seen.has(key(o)) ? null : o);
    return seen;
  };
  const a = once(current);
  const b = once(read);
  const pairs = [...a].flatMap(([k, from]) => {
    const to = b.get(k);
    return from && to && k.trim() ? [{ from, to }] : [];
  });
  if (pairs.length < 4) return null;
  // Least squares for each coordinate: the normal equations of [x y 1].
  const solve = (target: (p: (typeof pairs)[number]) => number) => {
    const m = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (const p of pairs) {
      const row = [p.from.x, p.from.y, 1];
      const t = target(p);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) m[r][c] += row[r] * row[c];
        m[r][3] += row[r] * t;
      }
    }
    for (let c = 0; c < 3; c++) {
      const pivot = m.slice(c).reduce((best, row, k) => (Math.abs(row[c]) > Math.abs(m[best][c]) ? c + k : best), c);
      [m[c], m[pivot]] = [m[pivot], m[c]];
      if (Math.abs(m[c][c]) < 1e-12) return null;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  };
  const fx = solve((p) => p.to.x);
  const fy = solve((p) => p.to.y);
  if (!fx || !fy) return null;
  const matrix = [...fx, ...fy] as [number, number, number, number, number, number];
  const error = Math.max(...pairs.map((p) => Math.hypot(fx[0] * p.from.x + fx[1] * p.from.y + fx[2] - p.to.x, fy[0] * p.from.x + fy[1] * p.from.y + fy[2] - p.to.y)));
  return { matrix, error, matched: pairs.length };
}

type Entered = Placed & { room: string; assetId: number | null; note: string };

/**
 * The outlets read from a new drawing, with what was entered for the plan's outlets (room, device,
 * note) carried over to those labelled alike. Where a label is on more than one outlet, each takes
 * the nearest, once the old places are moved onto the new drawing by `fit`.
 */
export function carryOver<T extends Placed>(current: Entered[], read: T[], fit: number[] | null) {
  const place = (o: Placed) => (fit ? { x: fit[0] * o.x + fit[1] * o.y + fit[2], y: fit[3] * o.x + fit[4] * o.y + fit[5] } : o);
  const left = current.filter((o) => o.room || o.assetId || o.note);
  let carried = 0;
  const outlets = read.map((o) => {
    const same = left.filter((c) => key(c) === key(o) && key(o).trim());
    if (!same.length) return { ...o, room: "", assetId: null as number | null, note: "" };
    const nearest = same.toSorted((a, b) => Math.hypot(place(a).x - o.x, place(a).y - o.y) - Math.hypot(place(b).x - o.x, place(b).y - o.y))[0];
    left.splice(left.indexOf(nearest), 1);
    carried++;
    return { ...o, room: nearest.room, assetId: nearest.assetId, note: nearest.note };
  });
  return { outlets, carried, lost: left.length };
}
