import { escapeXml } from "./package";

export { isDark } from "@/lib/presentations";

// DrawingML for the few things the app draws on a slide itself: text boxes, pictures and plain
// shapes. Positions and sizes are in EMU; colours are hex without the #.

export const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

export type Box = { x: number; y: number; w: number; h: number };

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/** Whether text reads right to left: its first strong letter is Arabic. */
export const isRtl = (text: string) => {
  const first = text.match(/[A-Za-z؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/)?.[0];
  return !!first && ARABIC.test(first);
};

const xfrm = ({ x, y, w, h }: Box) => `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm>`;

/** A fill: a hex colour, optionally see-through (alpha 0-100, 100 solid). */
export const solidFill = (color: string, alpha = 100) =>
  `<a:solidFill><a:srgbClr val="${color}">${alpha < 100 ? `<a:alpha val="${Math.round(alpha * 1000)}"/>` : ""}</a:srgbClr></a:solidFill>`;

export type Paragraph = {
  text: string;
  /** Points. */
  size: number;
  bold?: boolean;
  /** A complete fill element (solidFill) for the text. */
  fill: string;
  font?: string | null;
  bullet?: boolean;
  align?: "l" | "ctr" | "r";
  /** Space after, in points. */
  after?: number;
};

function paragraphXml(p: Paragraph) {
  const rtl = isRtl(p.text);
  const align = p.align ?? (rtl ? "r" : "l");
  const bullet = p.bullet ? `<a:buFont typeface="Arial"/><a:buChar char="•"/>` : "<a:buNone/>";
  const indent = p.bullet ? (rtl ? ' marR="285750" indent="-285750"' : ' marL="285750" indent="-285750"') : "";
  const spacing = p.after ? `<a:spcAft><a:spcPts val="${p.after * 100}"/></a:spcAft>` : "";
  const font = p.font ? `<a:latin typeface="${escapeXml(p.font)}"/><a:cs typeface="${escapeXml(p.font)}"/>` : "";
  const run = `<a:rPr lang="${rtl ? "ar-SA" : "en-US"}" sz="${Math.round(p.size * 100)}"${p.bold ? ' b="1"' : ""} dirty="0">${p.fill}${font}</a:rPr>`;
  return `<a:p><a:pPr algn="${align}"${rtl ? ' rtl="1"' : ""}${indent}>${spacing}${bullet}</a:pPr><a:r>${run}<a:t>${escapeXml(p.text)}</a:t></a:r></a:p>`;
}

/** A text box. Text that does not fit is shrunk by PowerPoint rather than spilling out. */
export function textBox(id: number, name: string, box: Box, paragraphs: Paragraph[], anchor: "t" | "ctr" | "b" = "t") {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>` +
    paragraphs.map(paragraphXml).join("") +
    `</p:txBody></p:sp>`
  );
}

/** A plain shape: a rectangle or an ellipse, filled. */
export function shape(id: number, name: string, box: Box, geometry: "rect" | "ellipse", fill: string) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
  );
}

/** Where to crop an image (in thousandths of a percent from each side) so it fills a box. */
export function coverCrop(image: { width: number; height: number }, box: { w: number; h: number }) {
  const imageRatio = image.width / image.height;
  const boxRatio = box.w / box.h;
  if (Math.abs(imageRatio - boxRatio) < 0.001) return "";
  if (imageRatio > boxRatio) {
    const side = Math.round(((1 - boxRatio / imageRatio) / 2) * 100000);
    return `<a:srcRect l="${side}" r="${side}"/>`;
  }
  const side = Math.round(((1 - imageRatio / boxRatio) / 2) * 100000);
  return `<a:srcRect t="${side}" b="${side}"/>`;
}

/** The largest box of the image's shape that fits inside `box`, centred in it. */
export function fitInside(image: { width: number; height: number }, box: Box): Box {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A picture, its image already related to the slide as `relId`. */
export function picture(id: number, name: string, relId: string, box: Box, crop = "") {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relId}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/** A whole slide: its background and its shapes. */
export function slideXml(background: string, shapes: string[]) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${background}<a:effectLst/></p:bgPr></p:bg><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    shapes.join("") +
    `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}
