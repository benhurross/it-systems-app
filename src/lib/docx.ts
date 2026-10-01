import { strToU8, zipSync } from "fflate";

/**
 * A small Word (.docx) writer: paragraphs of formatted text, pictures and page sizes, which is
 * what a PDF turned into Word needs. It writes the Office Open XML parts directly, in the order
 * Word's schema asks for, and zips them.
 */

export type WordRun = {
  text: string;
  /** Points. */
  size: number;
  font?: string;
  bold?: boolean;
  italic?: boolean;
  /** Arabic or another right-to-left script. */
  rtl?: boolean;
};

export type WordParagraph = {
  kind: "paragraph";
  runs: WordRun[];
  heading?: 1 | 2;
  /** Both: justified, lines filling the width. */
  align?: "center" | "right" | "both";
  /** Reads right to left. */
  rtl?: boolean;
  /** Points from the margin, for the whole paragraph and for its first line. */
  indent?: number;
  firstLine?: number;
  /** Points of space above. */
  spaceBefore?: number;
  /** Line spacing as a multiple of single. */
  lineSpacing?: number;
  /** Tab stops, in points from the margin the paragraph starts at. */
  tabs?: number[];
  pageBreakBefore?: boolean;
};

export type WordPicture = {
  kind: "picture";
  bytes: Uint8Array;
  type: "image/png" | "image/jpeg";
  /** Points, as it should show. */
  width: number;
  height: number;
  align?: "center" | "right";
  indent?: number;
  spaceBefore?: number;
  pageBreakBefore?: boolean;
};

export type WordBlock = WordParagraph | WordPicture;

/** Pages of one size and margins; a new section starts on a new page. */
export type WordSection = { width: number; height: number; margin: number; blocks: WordBlock[] };

export type WordDocument = { title: string; sections: WordSection[] };

const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  officeRel: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Points to twentieths of a point, Word's unit for lengths on the page. */
const twips = (pt: number) => Math.round(pt * 20);
/** Points to English Metric Units, the drawing unit. */
const emu = (pt: number) => Math.round(pt * 12700);

/** Text safe inside XML: escaped, and without characters XML may not hold at all. */
export function xmlText(text: string) {
  return text
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runXml(run: WordRun) {
  const props = [
    run.font ? `<w:rFonts w:ascii="${xmlText(run.font)}" w:hAnsi="${xmlText(run.font)}" w:cs="${xmlText(run.font)}" w:eastAsia="${xmlText(run.font)}"/>` : "",
    run.bold ? "<w:b/><w:bCs/>" : "",
    run.italic ? "<w:i/><w:iCs/>" : "",
    `<w:sz w:val="${Math.max(2, Math.round(run.size * 2))}"/><w:szCs w:val="${Math.max(2, Math.round(run.size * 2))}"/>`,
    run.rtl ? "<w:rtl/>" : "",
  ].join("");
  // A tab is its own element; the text between tabs keeps its spaces.
  const content = run.text
    .split("\t")
    .map((part) => (part ? `<w:t xml:space="preserve">${xmlText(part)}</w:t>` : ""))
    .join("<w:tab/>");
  return `<w:r><w:rPr>${props}</w:rPr>${content}</w:r>`;
}

function paragraphProps(block: WordBlock, sectionEnd: string) {
  const p = block.kind === "paragraph" ? block : null;
  const props = [
    p?.heading ? `<w:pStyle w:val="Heading${p.heading}"/>` : "",
    block.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    p?.tabs?.length ? `<w:tabs>${p.tabs.map((pos) => `<w:tab w:val="left" w:pos="${twips(pos)}"/>`).join("")}</w:tabs>` : "",
    p?.rtl ? "<w:bidi/>" : "",
    `<w:spacing w:before="${twips(Math.max(0, block.spaceBefore ?? 0))}" w:after="0"${p?.lineSpacing ? ` w:line="${Math.round(240 * p.lineSpacing)}" w:lineRule="auto"` : ""}/>`,
    block.indent || p?.firstLine
      ? `<w:ind w:left="${twips(Math.max(0, block.indent ?? 0))}"${p?.firstLine ? (p.firstLine > 0 ? ` w:firstLine="${twips(p.firstLine)}"` : ` w:hanging="${twips(-p.firstLine)}"`) : ""}/>`
      : "",
    block.align ? `<w:jc w:val="${block.align}"/>` : "",
    sectionEnd,
  ].join("");
  return props ? `<w:pPr>${props}</w:pPr>` : "";
}

function pictureXml(picture: WordPicture, relId: string, n: number) {
  const cx = emu(picture.width);
  const cy = emu(picture.height);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${n}" name="Picture ${n}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}"><pic:pic xmlns:pic="${NS.pic}">` +
    `<pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function sectionXml(section: WordSection) {
  const landscape = section.width > section.height;
  const m = twips(section.margin);
  return (
    `<w:sectPr><w:pgSz w:w="${twips(section.width)}" w:h="${twips(section.height)}"${landscape ? ' w:orient="landscape"' : ""}/>` +
    `<w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="${Math.min(m, 708)}" w:footer="${Math.min(m, 708)}" w:gutter="0"/></w:sectPr>`
  );
}

const STYLES =
  XML_HEAD +
  `<w:styles xmlns:w="${NS.w}">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr></w:style>` +
  `</w:styles>`;

const SETTINGS =
  XML_HEAD +
  `<w:settings xmlns:w="${NS.w}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
  `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

/** The document as a .docx file. */
export function buildDocx(doc: WordDocument, now = new Date()): Uint8Array {
  const media: Record<string, Uint8Array> = {};
  const rels: string[] = [
    `<Relationship Id="rIdStyles" Type="${NS.officeRel}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rIdSettings" Type="${NS.officeRel}/settings" Target="settings.xml"/>`,
  ];
  let pictures = 0;
  const body: string[] = [];

  doc.sections.forEach((section, s) => {
    const last = s === doc.sections.length - 1;
    // Every section but the last ends in its last paragraph; one with nothing in it gets an empty one.
    const blocks: WordBlock[] = section.blocks.length ? section.blocks : [{ kind: "paragraph", runs: [] }];
    blocks.forEach((block, b) => {
      const end = !last && b === blocks.length - 1 ? sectionXml(section) : "";
      if (block.kind === "picture") {
        pictures++;
        const name = `image${pictures}.${block.type === "image/png" ? "png" : "jpeg"}`;
        const relId = `rIdImage${pictures}`;
        media[`word/media/${name}`] = block.bytes;
        rels.push(`<Relationship Id="${relId}" Type="${NS.officeRel}/image" Target="media/${name}"/>`);
        body.push(`<w:p>${paragraphProps(block, end)}${pictureXml(block, relId, pictures)}</w:p>`);
      } else {
        body.push(`<w:p>${paragraphProps(block, end)}${block.runs.map(runXml).join("")}</w:p>`);
      }
    });
    if (last) body.push(sectionXml(section));
  });

  const document =
    XML_HEAD +
    `<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"><w:body>${body.join("")}</w:body></w:document>`;

  const created = now.toISOString().replace(/\.\d+Z$/, "Z");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      XML_HEAD +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Default Extension="png" ContentType="image/png"/>` +
        `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      XML_HEAD +
        `<Relationships xmlns="${NS.rel}">` +
        `<Relationship Id="rId1" Type="${NS.officeRel}/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="${NS.officeRel}/extended-properties" Target="docProps/app.xml"/>` +
        `</Relationships>`,
    ),
    "docProps/core.xml": strToU8(
      XML_HEAD +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${xmlText(doc.title)}</dc:title>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
        `</cp:coreProperties>`,
    ),
    "docProps/app.xml": strToU8(
      XML_HEAD + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AP Plus IT Systems</Application></Properties>`,
    ),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(STYLES),
    "word/settings.xml": strToU8(SETTINGS),
    "word/_rels/document.xml.rels": strToU8(XML_HEAD + `<Relationships xmlns="${NS.rel}">${rels.join("")}</Relationships>`),
    ...media,
  };
  // Pictures are compressed already; the XML is not.
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level: name.startsWith("word/media/") ? 0 : 6 }]])));
}
