import { createTranslator } from "next-intl";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";

/**
 * Emails are written once per language and sent with English first and Arabic below it, since
 * recipients read either. Everything taken from a record is escaped, so a ticket subject can never
 * add markup or links to a message.
 */

// Keys are checked by the messages test (both languages have the same ones), not by the type system:
// typing them from the full message files is more than the compiler can handle here.
export type Translator = (key: string, values?: Record<string, string | number>) => string;
const translator = (locale: "en" | "ar", messages: object) =>
  createTranslator({ locale, messages: messages as Record<string, unknown>, namespace: "email" }) as unknown as Translator;
export const translators = { en: translator("en", en), ar: translator("ar", ar) } as const;
export type Locale = keyof typeof translators;

export type Button = { label: string; href: string; primary?: boolean };
/** One language's part of an email. */
export type Section = {
  heading: string;
  paragraphs: string[];
  details?: [label: string, value: string][];
  buttons?: Button[];
  note?: string;
};

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const COLORS = { text: "#1e2022", muted: "#5c6b7c", border: "#e3e8ef", page: "#f7faff", brand: "#0047ba" };

function section(s: Section, locale: Locale) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const paragraphs = s.paragraphs
    .map((p) => `<p style="margin:0 0 12px;line-height:1.5">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const details = s.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border-collapse:collapse;width:100%">${s.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 0;color:${COLORS.muted};width:35%;vertical-align:top">${escape(label)}</td><td style="padding:6px 0;vertical-align:top">${escape(value).replace(/\n/g, "<br>")}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const buttons = s.buttons?.length
    ? `<p style="margin:8px 0 4px">${s.buttons
        .map((b) =>
          b.primary
            ? `<a href="${escape(b.href)}" style="display:inline-block;margin:0 0 8px;padding:10px 18px;border-radius:8px;background:${COLORS.brand};color:#ffffff;text-decoration:none;font-weight:600">${escape(b.label)}</a>`
            : `<a href="${escape(b.href)}" style="display:inline-block;margin:0 0 8px;padding:9px 17px;border-radius:8px;border:1px solid ${COLORS.brand};color:${COLORS.brand};text-decoration:none;font-weight:600">${escape(b.label)}</a>`,
        )
        .join("&nbsp;&nbsp;")}</p>`
    : "";
  const note = s.note ? `<p style="margin:12px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.5">${escape(s.note)}</p>` : "";
  return `<td dir="${dir}" lang="${locale}" style="padding:24px 28px;text-align:${align}"><h1 style="margin:0 0 12px;font-size:20px">${escape(s.heading)}</h1>${paragraphs}${details}${buttons}${note}</td>`;
}

function sectionText(s: Section) {
  return [
    s.heading,
    "",
    ...s.paragraphs,
    ...(s.details ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(s.buttons ?? []).map((b) => `${b.label}: ${b.href}`),
    ...(s.note ? ["", s.note] : []),
  ].join("\n");
}

/** The whole message, as HTML and as plain text, from one section per language. */
export function render(content: Record<Locale, Section>) {
  const footer = `${translators.en("footer")} · ${translators.ar("footer")}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:${COLORS.page};font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;color:${COLORS.text}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page}"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px"><tr><td style="padding:18px 28px;border-bottom:1px solid ${COLORS.border};font-weight:700;color:${COLORS.brand}">AP Plus IT</td></tr><tr>${section(content.en, "en")}</tr><tr><td style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0">&nbsp;</td></tr><tr>${section(content.ar, "ar")}</tr></table><p style="margin:16px 0 0;color:${COLORS.muted};font-size:12px">${escape(footer)}</p></td></tr></table></body></html>`;
  const text = `${sectionText(content.en)}\n\n----------\n\n${sectionText(content.ar)}\n\n${footer}\n`;
  return { html, text };
}

/** Builds each language's section from the same function, and a subject in both languages. */
export function bilingual(build: (t: Translator, locale: Locale) => Section & { subject: string }) {
  const parts = { en: build(translators.en, "en"), ar: build(translators.ar, "ar") };
  return { subject: `${parts.en.subject} | ${parts.ar.subject}`, ...render(parts) };
}

/** Confirms the app can reach the mail server. */
export function testEmail(senderName: string) {
  return bilingual((t) => ({
    subject: t("test.subject"),
    heading: t("test.heading"),
    paragraphs: [t("test.body", { name: senderName })],
  }));
}
