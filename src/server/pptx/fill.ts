import { escapeXml, unescapeXml } from "./package";

/** The fill-ins a slide may hold, typed in PowerPoint as {client}, {date} and so on. */
export const FILL_INS = ["client", "contact", "date", "presenter", "title"] as const;
export type FillIn = (typeof FILL_INS)[number];

const FILL_IN = new RegExp(`\\{\\s*(${FILL_INS.join("|")})\\s*\\}`, "gi");
const TEXT = /(<a:t(?:\s[^>]*)?>)([^<]*)(<\/a:t>)/g;

/**
 * Replaces the fill-ins in a slide's text with their values. PowerPoint often splits what was
 * typed as one word across several runs ("{cli" "ent}"), so each paragraph is read as a whole:
 * the value takes the place of the fill-in in the run where it starts, keeping that run's look.
 * A fill-in with no value is left as typed, so it shows what still needs filling in.
 */
export function fillIn(xml: string, values: Partial<Record<FillIn, string>>) {
  if (!xml.includes("{")) return xml;
  return xml.replace(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraph) => {
    const runs = [...paragraph.matchAll(TEXT)];
    const texts = runs.map((r) => unescapeXml(r[2]));
    const whole = texts.join("");
    const found = [...whole.matchAll(FILL_IN)]
      .map((m) => ({ start: m.index!, end: m.index! + m[0].length, value: values[m[1].toLowerCase() as FillIn] }))
      .filter((m): m is { start: number; end: number; value: string } => typeof m.value === "string");
    if (found.length === 0) return paragraph;

    // Each run keeps its characters outside the fill-ins; a fill-in's value goes where it starts.
    let offset = 0;
    const replaced = texts.map((text) => {
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const at = offset + i;
        const hit = found.find((f) => at >= f.start && at < f.end);
        if (!hit) out += text[i];
        else if (at === hit.start) out += hit.value;
      }
      offset += text.length;
      return out;
    });
    let n = 0;
    return paragraph.replace(TEXT, (_, open: string, _text: string, close: string) => `${open}${escapeXml(replaced[n++])}${close}`);
  });
}
