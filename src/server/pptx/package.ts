import { strFromU8, strToU8, unzipSync, type Zippable, zipSync } from "fflate";

// A PowerPoint file is a zip of parts (XML files and media) tied together by relationship files
// and listed in [Content_Types].xml. This is just enough of that packaging to take slides out of
// one file and put them into another. Part names here have no leading slash: "ppt/slides/slide1.xml".

export const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS_XMLNS = "http://schemas.openxmlformats.org/package/2006/relationships";

export type Relationship = { id: string; type: string; target: string; external: boolean };

/** The last part of a relationship type: "slide", "image", "slideLayout"… */
export const relKind = (type: string) => type.slice(type.lastIndexOf("/") + 1);

export const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export const unescapeXml = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) =>
    e === "amp" ? "&" : e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unescapeXml(m[1]) : null;
};

const dirOf = (part: string) => part.slice(0, part.lastIndexOf("/") + 1);

/** Where a part's relationships are kept: ppt/slides/_rels/slide1.xml.rels. */
export const relsPathOf = (part: string) => `${dirOf(part)}_rels/${part.slice(part.lastIndexOf("/") + 1)}.rels`;

/** A relationship's target, relative to the part it is from, as a part name. */
export function resolveTarget(from: string, target: string) {
  const segments = (target.startsWith("/") ? target.slice(1) : dirOf(from) + target).split("/");
  const out: string[] = [];
  for (const s of segments) {
    if (s === "..") out.pop();
    else if (s !== ".") out.push(s);
  }
  return out.join("/");
}

/** The path from one part's folder to another part, as relationships write it. */
export function relativeTarget(from: string, to: string) {
  const a = dirOf(from).split("/").filter(Boolean);
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

export class Package {
  private constructor(private files: Map<string, Uint8Array>) {}

  static open(bytes: Uint8Array) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new Error("notPowerPoint");
    }
    const files = new Map(Object.entries(entries).filter(([name]) => !name.endsWith("/")));
    if (!files.has("[Content_Types].xml") || !files.has("ppt/presentation.xml")) throw new Error("notPowerPoint");
    return new Package(files);
  }

  clone() {
    return new Package(new Map(this.files));
  }

  has(part: string) {
    return this.files.has(part);
  }

  parts() {
    return [...this.files.keys()];
  }

  bytes(part: string) {
    const b = this.files.get(part);
    if (!b) throw new Error(`Missing part ${part}`);
    return b;
  }

  text(part: string) {
    return strFromU8(this.bytes(part));
  }

  set(part: string, content: string | Uint8Array) {
    this.files.set(part, typeof content === "string" ? strToU8(content) : content);
  }

  delete(part: string) {
    this.files.delete(part);
  }

  rels(part: string): Relationship[] {
    const path = relsPathOf(part);
    if (!this.files.has(path)) return [];
    return [...this.text(path).matchAll(/<Relationship\b[^>]*\/?>/g)].map(([tag]) => ({
      id: attr(tag, "Id")!,
      type: attr(tag, "Type")!,
      target: attr(tag, "Target")!,
      external: attr(tag, "TargetMode") === "External",
    }));
  }

  setRels(part: string, rels: Relationship[]) {
    const body = rels
      .map((r) => `<Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ""}/>`)
      .join("");
    this.set(relsPathOf(part), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_XMLNS}">${body}</Relationships>`);
  }

  /** The parts a part points at, with their relationships. */
  targets(part: string) {
    return this.rels(part)
      .filter((r) => !r.external)
      .map((r) => ({ rel: r, part: resolveTarget(part, r.target) }));
  }

  /** A relationship id not yet used by the part. */
  freeRelId(part: string) {
    const used = new Set(this.rels(part).map((r) => r.id));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n++;
    return `rId${n}`;
  }

  // ------------------------------------------------------------ content types

  private types() {
    const xml = this.text("[Content_Types].xml");
    const defaults = new Map<string, string>();
    const overrides = new Map<string, string>();
    for (const [tag] of xml.matchAll(/<Default\b[^>]*\/?>/g)) defaults.set(attr(tag, "Extension")!.toLowerCase(), attr(tag, "ContentType")!);
    for (const [tag] of xml.matchAll(/<Override\b[^>]*\/?>/g)) overrides.set(attr(tag, "PartName")!.replace(/^\//, ""), attr(tag, "ContentType")!);
    return { defaults, overrides };
  }

  private writeTypes({ defaults, overrides }: { defaults: Map<string, string>; overrides: Map<string, string> }) {
    const d = [...defaults].map(([ext, type]) => `<Default Extension="${escapeXml(ext)}" ContentType="${escapeXml(type)}"/>`).join("");
    const o = [...overrides].map(([part, type]) => `<Override PartName="/${escapeXml(part)}" ContentType="${escapeXml(type)}"/>`).join("");
    this.set(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${d}${o}</Types>`,
    );
  }

  contentType(part: string) {
    const { defaults, overrides } = this.types();
    return overrides.get(part) ?? defaults.get(part.slice(part.lastIndexOf(".") + 1).toLowerCase()) ?? null;
  }

  /** Records a part's content type: by its extension where that already says it, else on its own. */
  setContentType(part: string, type: string) {
    const types = this.types();
    const ext = part.slice(part.lastIndexOf(".") + 1).toLowerCase();
    if (types.defaults.get(ext) === type) types.overrides.delete(part);
    else if (!types.defaults.has(ext) && !ext.endsWith("xml") && ext !== "rels") types.defaults.set(ext, type);
    else types.overrides.set(part, type);
    this.writeTypes(types);
  }

  /** Forgets the content types of parts no longer in the package. */
  pruneContentTypes() {
    const types = this.types();
    for (const part of [...types.overrides.keys()]) if (!this.files.has(part)) types.overrides.delete(part);
    this.writeTypes(types);
  }

  /** A name for a new part like `like`, numbered past the parts already in its folder. */
  freeName(like: string) {
    const dir = dirOf(like);
    const file = like.slice(dir.length);
    const dot = file.lastIndexOf(".");
    const stem = (dot > 0 ? file.slice(0, dot) : file).replace(/\d+$/, "") || "part";
    const ext = dot > 0 ? file.slice(dot) : "";
    let n = 1;
    while (this.files.has(`${dir}${stem}${n}${ext}`)) n++;
    return `${dir}${stem}${n}${ext}`;
  }

  /** Removes every part that nothing reaches from the package's root relationships. */
  removeUnreachable() {
    const reached = new Set<string>(["[Content_Types].xml"]);
    const walk = (part: string) => {
      for (const { part: target } of this.targets(part)) {
        if (reached.has(target) || !this.files.has(target)) continue;
        reached.add(target);
        walk(target);
      }
    };
    walk("");
    for (const part of [...this.files.keys()]) {
      if (part === "_rels/.rels" || reached.has(part)) continue;
      // A relationships file stays with its part.
      const owner = part.match(/^(.*?)_rels\/([^/]+)\.rels$/);
      if (owner && reached.has(owner[1] + owner[2])) continue;
      this.files.delete(part);
    }
    this.pruneContentTypes();
  }

  toBytes() {
    // [Content_Types].xml first, as Office writes it. Pictures are already compressed: stored as they are.
    const entries: Zippable = { "[Content_Types].xml": this.bytes("[Content_Types].xml") };
    for (const [name, bytes] of this.files) {
      if (name !== "[Content_Types].xml") entries[name] = /\.(png|jpe?g|gif|mp4|m4a|mp3|wdp)$/i.test(name) ? [bytes, { level: 0 }] : bytes;
    }
    return zipSync(entries, { level: 6 });
  }
}
