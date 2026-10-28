/** An outlet on a made-up SVG plan: its labels, at a point in the drawing's units. */
export type SvgOutlet = { p: string; s: string; x: number; y: number };

/**
 * A made-up floor plan as a CAD program exports one, like the office's: a sheet behind it, layers
 * of lines (walls, doors) under a turned group, room names turned back to read level (SERVER among
 * them, two of them set on two lines), and the outlets' labels P over S in their own group.
 */
export function floorPlanSvg(outlets: SvgOutlet[]) {
  const wall = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#636466" stroke-width="0.1"/>`;
  // Inside the turned group a point (u, v) lands at (v, 842 - u), as in the office's file.
  const at = (x: number, y: number) => [842 - y, x] as const;
  const box = (x: number, y: number, w: number, h: number) => {
    const [a, b] = at(x, y);
    const [c, d] = at(x + w, y + h);
    return [wall(a, b, c, b), wall(c, b, c, d), wall(c, d, a, d), wall(a, d, a, b)].join("");
  };
  const room = (name: string, x: number, y: number) => {
    const [u, v] = at(x, y);
    return `<text transform="translate(${u} ${v}) rotate(90)" font-size="1.33">${name}</text>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 100 200 300" width="200mm" height="300mm">
<rect x="100" y="100" width="200" height="300" fill="#ffffff"/>
<g transform="matrix(0 -1 1 0 0 842)">
<g id="layer-walls-and-columns" data-layer="fire">${box(110, 110, 180, 280)}${box(110, 110, 60, 60)}${box(230, 330, 60, 60)}${box(170, 110, 60, 60)}${box(110, 330, 60, 60)}</g>
<g id="layer-DOOR" data-layer="DOOR"><path d="M${at(150, 170).join(" ")}C${at(152, 172).join(" ")} ${at(158, 172).join(" ")} ${at(160, 170).join(" ")}" stroke="#636466"/></g>
<g id="room-labels">${room("SERVER", 135, 135)}${room("PROJECT", 255, 355)}${room("MANAGER", 255, 357)}${room("+0,15", 200, 200)}</g>
</g>
<g id="network-labels">${outlets
    .map((o, i) => `<g id="net-${i}" data-label="${o.p} ${o.s}"><text x="${o.x}" y="${o.y}" font-size="1.6" fill="#4055ff"><tspan x="${o.x}">${o.p}</tspan><tspan x="${o.x}" dy="1.9">${o.s}</tspan></text></g>`)
    .join("\n")}</g>
</svg>`;
}
