import { createServer, type AddressInfo } from "node:net";
import { crc32, deflateSync } from "node:zlib";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** Fails the test if the page logs an error to the console. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    // Browsers report this when a ResizeObserver (the CMDB graph measures its nodes with one)
    // needs a second pass in a frame. Nothing is lost, and it is not an application error.
    if (!error.message.startsWith("ResizeObserver loop")) errors.push(error.message);
  });
  return { assertClean: () => expect(errors, errors.join("\n")).toEqual([]) };
}

/**
 * A browser context with nobody signed in. Contexts made in a test otherwise start with the
 * session that test uses, which would hide sign-in from a journey that needs it.
 */
export const signedOut = (browser: Browser) => browser.newContext({ storageState: { cookies: [], origins: [] } });

/** Signs in through the form, as a person would. */
export async function signIn(page: Page, email: string, password: string, locale = "en") {
  await page.goto(`/${locale}/sign-in`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email").fill(email);
  await page.getByLabel(locale === "ar" ? "كلمة المرور" : "Password").fill(password);
  await page.getByRole("button", { name: locale === "ar" ? "دخول" : "Sign in" }).click();
}

/** A value unique to this test and browser, so parallel runs never collide on the shared database. */
export const unique = (info: TestInfo, label: string) => `${label} ${info.project.name} ${info.workerIndex}-${Date.now() % 100_000}`;

/** Picks an option from one of the app's select fields by its label. */
export async function choose(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

/** A TCP port on this machine that the test opens and closes, standing in for a device. */
export async function listen() {
  const server = createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Registers a device on this machine that is monitored over `port`. */
export async function addTcpDevice(page: Page, name: string, port: number) {
  const res = await page.request.post("/api/assets", {
    data: {
      name,
      category: "servers",
      type: "physical_server",
      status: "in_use",
      location: "jeddah",
      supportStatus: "supported",
      criticality: "high",
      ipAddress: "127.0.0.1",
      monitorMethod: "tcp",
      monitorPort: port,
    },
  });
  expect(res.ok()).toBe(true);
}

/**
 * A mail server on this machine that accepts every message and keeps it, for checking what the app
 * sends. It speaks just enough SMTP for a plain connection with no sign-in.
 */
export async function mailSink() {
  const messages: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let body: string[] | null = null;
    socket.write("220 sink ESMTP\r\n");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\r\n"); end >= 0; end = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (body) {
          if (line === ".") {
            messages.push(body.join("\n"));
            body = null;
            socket.write("250 Queued\r\n");
          } else body.push(line);
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === "DATA") {
          body = [];
          socket.write("354 Go ahead\r\n");
        } else if (command === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    messages,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Opens a ticket for the demo employee, resolves it, and returns the answer link's token from the
 * resolution email in the outbox. Needs an admin session, which can read the outbox.
 */
export async function resolvedTicket(page: Page, subject: string) {
  const users = (await (await page.request.get("/api/settings/users")).json()) as { email: string; employeeId: number }[];
  const requesterId = users.find((u) => u.email === "employee@applus.test")!.employeeId;
  const created = await page.request.post("/api/tickets", {
    data: { type: "request", subject, description: "Raised by a test.", issueType: "hardware", location: "jeddah", requesterId },
  });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: number };
  const resolved = await page.request.patch(`/api/tickets/${id}`, { data: { status: "resolved", resolution: "Restarted the print spooler." } });
  expect(resolved.ok()).toBe(true);
  const outbox = (await (await page.request.get("/api/settings/email/outbox")).json()) as { id: number; ticketId: number; kind: string; recipient: string }[];
  const email = outbox.find((e) => e.ticketId === id && e.kind === "resolution")!;
  const { html } = (await (await page.request.get(`/api/settings/email/outbox/${email.id}`)).json()) as { html: string };
  return { id, token: /\/en\/respond\/([\w-]+)\?/.exec(html)![1], recipient: email.recipient };
}

/**
 * A real PNG of the given size: a light background with a darker disc in the middle, enough to
 * stand in for a photo or a card design.
 */
export function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const radius = Math.min(width, height) / 3;
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const inside = (x - width / 2) ** 2 + (y - height / 2) ** 2 < radius ** 2;
      row.set(inside ? [60, 90, 140] : [225, 232, 240], 1 + x * 3);
    }
    return row;
  });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Prints an ID card for the demo admin, so their dashboard shows one. Needs an admin session.
 * Browsers side by side may print the same card, so one already printed is fine.
 */
export async function printedCardForAdmin(page: Page) {
  const users = (await (await page.request.get("/api/settings/users")).json()) as { email: string; employeeId: number }[];
  const employeeId = users.find((u) => u.email === "admin@applus.test")!.employeeId;
  const created = await page.request.post("/api/id-cards", { data: { employeeId, joinerId: null, reason: "other" } });
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: number };
  const printed = await page.request.post(`/api/id-cards/${id}/printed`);
  expect([200, 400]).toContain(printed.status());
}

/** A PDF to choose in a tool, page n of it `base + n` points wide so pages can be told apart. */
export async function pdfFile(name: string, pages: number, base = 500) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) pdf.addPage([base + n, 842]).drawText(`${name} ${n}`, { x: 40, y: 700, size: 28, font });
  return { name, mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) };
}

/** Each PDF tool with files chosen, as far as its every setting showing, in either language. */
export const TOOLS_IN_USE: Record<string, (page: Page) => Promise<void>> = {
  "/tools/pdf-merge": async (page) => {
    await page.locator('input[type="file"]').setInputFiles([await pdfFile("first-quarter-report.pdf", 2), await pdfFile("second.pdf", 3)]);
    await expect(page.locator("ol > li")).toHaveCount(2);
  },
  "/tools/pdf-split": async (page) => {
    await page.locator('input[type="file"]').setInputFiles(await pdfFile("annual-budget-overview.pdf", 6));
    await expect(page.locator("button[aria-pressed]")).toHaveCount(6);
    await page.locator("button[aria-pressed]").nth(1).click();
  },
  "/tools/pdf-organize": async (page) => {
    await page.locator('input[type="file"]').setInputFiles(await pdfFile("scan.pdf", 3));
    await expect(page.locator("ol > li")).toHaveCount(3);
    // One page removed, to show its button to put it back.
    await page.locator("ol > li").nth(1).locator("button").last().click();
  },
  "/tools/images-to-pdf": async (page) => {
    await page.locator('input[type="file"]').setInputFiles([
      { name: "receipt-photo-from-phone.png", mimeType: "image/png", buffer: png(800, 400) },
      { name: "tall.png", mimeType: "image/png", buffer: png(300, 600) },
    ]);
    await expect(page.locator("ol > li")).toHaveCount(2);
  },
  "/tools/pdf-stamp": async (page) => {
    await page.locator('input[type="file"]').setInputFiles(await pdfFile("policy.pdf", 3));
    await expect(page.getByRole("switch")).toHaveCount(2);
    await page.getByRole("switch").last().click();
    await expect(page.getByRole("switch").last()).toHaveAttribute("aria-checked", "true");
  },
};
