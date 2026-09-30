import { createTranslator } from "next-intl";
import { formatDate } from "@/lib/format";
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
  createTranslator({ locale, messages: messages as Record<string, unknown> }) as unknown as Translator;
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
            `<tr><td style="padding:6px 0;color:${COLORS.muted};width:35%;vertical-align:top">${escape(label)}</td><td dir="auto" style="padding:6px 0;vertical-align:top">${escape(value).replace(/\n/g, "<br>")}</td></tr>`,
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
  const footer = { en: translators.en("email.footer"), ar: translators.ar("email.footer") };
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:${COLORS.page};font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:15px;color:${COLORS.text}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page}"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px"><tr><td style="padding:18px 28px;border-bottom:1px solid ${COLORS.border};font-weight:700;color:${COLORS.brand}">AP Plus IT</td></tr><tr>${section(content.en, "en")}</tr><tr><td style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0">&nbsp;</td></tr><tr>${section(content.ar, "ar")}</tr></table><p style="margin:16px 0 0;color:${COLORS.muted};font-size:12px">${escape(footer.en)}</p><p dir="rtl" lang="ar" style="margin:4px 0 0;color:${COLORS.muted};font-size:12px">${escape(footer.ar)}</p></td></tr></table></body></html>`;
  const text = `${sectionText(content.en)}\n\n----------\n\n${sectionText(content.ar)}\n\n${footer.en}\n${footer.ar}\n`;
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
    subject: t("email.test.subject"),
    heading: t("email.test.heading"),
    paragraphs: [t("email.test.body", { name: senderName })],
  }));
}

/** To the requester when IT resolves their ticket: confirm the fix or say it is still a problem. */
export function resolutionEmail(p: {
  ref: string;
  subject: string;
  requester: string;
  resolver: string | null;
  resolution: string | null;
  closesOn: Date;
  link: (locale: Locale, answer: "fixed" | "not-fixed") => string;
}) {
  return bilingual((t, locale) => ({
    subject: t("email.resolution.subject", { ref: p.ref }),
    heading: t("email.resolution.heading"),
    paragraphs: [t("email.resolution.greeting", { name: p.requester }), t("email.resolution.body", { ref: p.ref })],
    details: [
      [t("email.resolution.request"), `${p.ref} ${p.subject}`],
      ...(p.resolver ? [[t("email.resolution.resolvedBy"), p.resolver] as [string, string]] : []),
      ...(p.resolution ? [[t("email.resolution.resolution"), p.resolution] as [string, string]] : []),
    ],
    buttons: [
      { label: t("email.resolution.fixed"), href: p.link(locale, "fixed"), primary: true },
      { label: t("email.resolution.notFixed"), href: p.link(locale, "not-fixed") },
    ],
    note: t("email.resolution.note", { date: formatDate(p.closesOn, locale) }),
  }));
}

/** What an IT email says about a ticket, in both languages; labels of reference lists come from the record. */
export type TicketFacts = {
  ref: string;
  type: "incident" | "request";
  subject: string;
  description: string;
  requester: string;
  department: Record<Locale, string>;
  location: Record<Locale, string>;
  issueType: Record<Locale, string>;
  priority: string;
};

const facts = (t: Translator, locale: Locale, f: TicketFacts): [string, string][] => [
  [t("email.ticket.subject"), `${f.ref} ${f.subject}`],
  [t("email.ticket.from"), `${f.requester} (${f.department[locale]})`],
  [t("email.ticket.location"), f.location[locale]],
  [t("email.ticket.issueType"), f.issueType[locale]],
  [t("email.ticket.priority"), t(`enums.priority.${f.priority}`)],
  [t("email.ticket.description"), f.description],
];

/** To each admin when a ticket arrives with nobody assigned: accept it, or hand it to someone on the team. */
export function newTicketEmail(p: {
  ticket: TicketFacts;
  staff: { id: string; name: string }[];
  link: (locale: Locale, to: string) => string;
  open: (locale: Locale) => string;
}) {
  return bilingual((t, locale) => ({
    subject: t("email.newTicket.subject", { type: p.ticket.type, ref: p.ticket.ref, subject: p.ticket.subject }),
    heading: t("email.newTicket.heading", { type: p.ticket.type, ref: p.ticket.ref }),
    paragraphs: [t("email.newTicket.body", { name: p.ticket.requester })],
    details: facts(t, locale, p.ticket),
    buttons: [
      { label: t("email.newTicket.accept"), href: p.link(locale, "me"), primary: true },
      ...p.staff.map((s) => ({ label: t("email.newTicket.assignTo", { name: s.name }), href: p.link(locale, s.id) })),
      { label: t("email.ticket.open"), href: p.open(locale) },
    ],
    note: t("email.newTicket.note"),
  }));
}

/** To the person a ticket was just assigned to. */
export function assignedEmail(p: { ticket: TicketFacts; by: string; open: (locale: Locale) => string }) {
  return bilingual((t, locale) => ({
    subject: t("email.assigned.subject", { ref: p.ticket.ref, subject: p.ticket.subject }),
    heading: t("email.assigned.heading", { ref: p.ticket.ref }),
    paragraphs: [t("email.assigned.body", { name: p.by })],
    details: facts(t, locale, p.ticket),
    buttons: [{ label: t("email.ticket.open"), href: p.open(locale), primary: true }],
  }));
}
