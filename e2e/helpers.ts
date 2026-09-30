import { createServer, type AddressInfo } from "node:net";
import { expect, type Page, type TestInfo } from "@playwright/test";

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
