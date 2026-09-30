import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailSettings } from "@/lib/schemas";
import { createTestDb } from "./helpers/db";

vi.mock("@/server/db", async () => ({ db: await createTestDb() }));
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-mail-password-encryption";

const { db } = await import("@/server/db");
const s = await import("@/server/db/schema");
const { getEmailSettings, getMailConfig, putEmailSettings } = await import("@/server/mail/config");
const outbox = await import("@/server/mail/outbox");
const { bilingual, testEmail } = await import("@/server/mail/templates");
const { seal, unseal } = await import("@/server/mail/secret");

const admin = { id: "admin", name: "Admin Person" };
const settings = emailSettings.parse({
  enabled: true,
  host: "mail.applus.test",
  port: 587,
  security: "starttls",
  username: "itsupport@applus.test",
  password: "S3cret!",
  fromName: "AP Plus IT",
  fromAddress: "itsupport@applus.test",
  appUrl: "http://192.168.0.159:3200/",
  allowInvalidCert: false,
});
const message = (to: string) => ({ kind: "test" as const, to, subject: "Hello", html: "<p>Hello</p>", text: "Hello" });

/** Stands in for the mail server: records what it was given, and fails for listed recipients. */
function fakeServer(failFor: string[] = []) {
  const sent: { to: unknown; from: unknown; subject: unknown }[] = [];
  outbox.useTransport(() => ({
    sendMail: async (mail) => {
      if (failFor.includes(String(mail.to))) throw new Error("550 Mailbox unavailable");
      sent.push({ to: mail.to, from: mail.from, subject: mail.subject });
    },
  }));
  return sent;
}

const lastEmail = async () => (await db.select().from(s.emails).orderBy(desc(s.emails.id)).limit(1))[0];

describe("email settings", () => {
  it("start with sending off, and keep messages in the outbox", async () => {
    expect(await getEmailSettings()).toMatchObject({ enabled: false, hasPassword: false, port: 587, security: "starttls" });
    const sent = fakeServer();
    await outbox.queueEmail([message("nora@applus.test")]);
    expect(await lastEmail()).toMatchObject({ recipient: "nora@applus.test", status: "held", attempts: 0 });
    expect(await outbox.deliverPending()).toBe(0);
    expect(sent).toEqual([]);
  });

  it("need a server, a sender and the app address before sending can be turned on", () => {
    const result = emailSettings.safeParse({ ...settings, host: "", fromAddress: "", appUrl: "" });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path[0]).sort()).toEqual(["appUrl", "fromAddress", "host"]);
    expect(emailSettings.safeParse({ ...settings, enabled: false, host: "", fromAddress: "", appUrl: "" }).success).toBe(true);
    expect(settings.appUrl).toBe("http://192.168.0.159:3200");
  });

  it("store the password encrypted, never hand it back, and keep it when left blank", async () => {
    await putEmailSettings(settings, admin);
    const [row] = await db.select().from(s.settings).where(eq(s.settings.key, "email"));
    expect(JSON.stringify(row.value)).not.toContain("S3cret!");
    const shown = await getEmailSettings();
    expect(shown.hasPassword).toBe(true);
    expect(JSON.stringify(shown)).not.toContain("S3cret!");
    expect((await getMailConfig()).password).toBe("S3cret!");

    await putEmailSettings({ ...settings, password: "" }, admin);
    expect((await getMailConfig()).password).toBe("S3cret!");
    await putEmailSettings({ ...settings, username: "", password: "" }, admin);
    expect((await getEmailSettings()).hasPassword).toBe(false);
    await putEmailSettings(settings, admin);

    const [audit] = await db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(1);
    expect(audit.summary).toBe("Changed email settings: sending on");
  });

  it("cannot read a password sealed with another secret", () => {
    const sealed = seal("S3cret!");
    expect(unseal(sealed)).toBe("S3cret!");
    expect(unseal(`${sealed.slice(0, -4)}AAAA`)).toBeNull();
  });
});

describe("sending", () => {
  beforeEach(async () => {
    await db.delete(s.emails);
  });

  it("delivers what is waiting from the saved sender, once, even when two runs overlap", async () => {
    const sent = fakeServer();
    await db.insert(s.emails).values([1, 2, 3].map((n) => ({ ...message(`p${n}@applus.test`), recipient: `p${n}@applus.test`, status: "pending" as const })));
    const [a, b] = await Promise.all([outbox.deliverPending(), outbox.deliverPending()]);
    expect(a + b).toBe(3);
    expect(sent.map((m) => m.to).sort()).toEqual(["p1@applus.test", "p2@applus.test", "p3@applus.test"]);
    expect(sent[0].from).toEqual({ name: "AP Plus IT", address: "itsupport@applus.test" });
    const rows = await db.select().from(s.emails);
    expect(rows.every((r) => r.status === "sent" && r.sentAt && r.attempts === 1)).toBe(true);
  });

  it("records a failure and tries again, up to the limit", async () => {
    fakeServer(["gone@applus.test"]);
    await db.insert(s.emails).values({ ...message("gone@applus.test"), recipient: "gone@applus.test", status: "pending" });
    for (let i = 0; i < outbox.MAX_ATTEMPTS + 2; i++) await outbox.deliverPending();
    expect(await lastEmail()).toMatchObject({ status: "failed", attempts: outbox.MAX_ATTEMPTS, error: "550 Mailbox unavailable" });
  });

  it("sends a test straight away and says what went wrong", async () => {
    fakeServer(["gone@applus.test"]);
    expect(await outbox.sendTest("ok@applus.test", testEmail("Admin Person"))).toEqual({ ok: true });
    expect(await lastEmail()).toMatchObject({ kind: "test", status: "sent" });
    expect(await outbox.sendTest("gone@applus.test", testEmail("Admin Person"))).toEqual({ ok: false, error: "550 Mailbox unavailable" });
    expect(await lastEmail()).toMatchObject({ kind: "test", status: "failed" });
  });

  it("lists the outbox newest first, without the message bodies", async () => {
    fakeServer();
    await outbox.queueEmail([message("a@applus.test"), message("b@applus.test")]);
    const rows = await outbox.listOutbox();
    expect(rows.map((r) => r.recipient)).toEqual(["b@applus.test", "a@applus.test"]);
    expect(rows[0]).not.toHaveProperty("html");
    expect((await outbox.getEmail(rows[0].id)).html).toBe("<p>Hello</p>");
  });
});

describe("templates", () => {
  it("write English then Arabic, right to left, and escape what comes from records", () => {
    const email = bilingual((t, locale) => ({
      subject: locale === "en" ? "Subject" : "الموضوع",
      heading: t("email.test.heading"),
      paragraphs: ['<script>alert("x")</script>'],
      details: [["Ticket", "Printer & scanner <b>jam</b>"]],
      buttons: [{ label: "Open", href: "http://app/x?a=1&b=2", primary: true }],
    }));
    expect(email.subject).toBe("Subject | الموضوع");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Printer &amp; scanner &lt;b&gt;jam&lt;/b&gt;");
    expect(email.html).toContain('href="http://app/x?a=1&amp;b=2"');
    expect(email.html.indexOf('lang="en"')).toBeLessThan(email.html.indexOf('dir="rtl" lang="ar"'));
    expect(email.text).toContain("Open: http://app/x?a=1&b=2");
    expect(email.text).toContain("البريد الإلكتروني يعمل");
  });
});
