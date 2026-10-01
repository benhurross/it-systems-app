import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD } from "../src/server/seed/demo-data";
import { session } from "./env";
import { BASE_URL } from "./env";
import { addTcpDevice, choose, listen, mailSink, png, resolvedTicket, signedOut } from "./helpers";

// Journeys that change system-wide settings. They run once, in their own project, so parallel
// browsers never race over the same value.
test.describe.configure({ mode: "serial" });
test.use({ storageState: session("admin") });

test("an SLA change applies to tickets opened afterwards", async ({ page }) => {
  await page.goto("/en/settings/service-desk");
  const critical = page.getByLabel("Critical (Hours)");
  // The page also holds the resolved tickets card, with its own Save.
  const saveSla = page.locator("form").filter({ has: critical }).getByRole("button", { name: "Save" });
  await expect(critical).toHaveValue("4");
  await critical.fill("2");
  await saveSla.click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await expect(critical).toHaveValue("2");

  const [employee] = (await (await page.request.get("/api/employees")).json()) as { id: number }[];
  const res = await page.request.post("/api/tickets", {
    data: {
      type: "incident",
      subject: "Core switch unreachable",
      description: "Nothing on the second floor has a network.",
      issueType: "internet",
      location: "jeddah",
      priority: "critical",
      requesterId: employee.id,
    },
  });
  const ticket = (await res.json()) as { createdAt: string; dueAt: string };
  expect(Date.parse(ticket.dueAt) - Date.parse(ticket.createdAt)).toBe(2 * 3_600_000);

  await critical.fill("4");
  await saveSla.click();
  await expect(page.getByText("Settings saved.").last()).toBeVisible();

  // An issue type with its own target uses it whatever the priority.
  const login = page.getByLabel("Login and access (Hours)");
  await login.fill("1.5");
  await saveSla.click();
  await expect(page.getByText("Settings saved.").last()).toBeVisible();
  await page.reload();
  await expect(login).toHaveValue("1.5");
  const quick = await page.request.post("/api/tickets", {
    data: { type: "incident", subject: "Locked out", description: "Cannot sign in.", issueType: "login", location: "jeddah", priority: "low", requesterId: employee.id },
  });
  const locked = (await quick.json()) as { createdAt: string; dueAt: string };
  expect(Date.parse(locked.dueAt) - Date.parse(locked.createdAt)).toBe(1.5 * 3_600_000);
  await login.fill("");
  await saveSla.click();
  await expect(page.getByText("Settings saved.").last()).toBeVisible();

  // Every save is in the audit log.
  await page.goto("/en/settings/audit");
  await page.getByRole("textbox", { name: "Filter rows" }).fill("Changed sla settings");
  await expect(page.getByRole("cell", { name: "Changed sla settings" })).toHaveCount(4);
});

test("turning network checks on in Settings starts them without a restart", async ({ page }) => {
  test.setTimeout(120_000);
  const { port, close } = await listen();
  await addTcpDevice(page, "SCHEDULED-PROBE", port);
  const toggle = async (seconds: string) => {
    await page.goto("/en/settings/monitoring");
    await page.getByRole("switch", { name: "Run checks" }).click();
    await page.getByLabel("Check every (seconds)").fill(seconds);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved.").last()).toBeVisible();
  };

  await toggle("15");
  await page.goto("/en/network/status");
  await expect(page.getByText("Checked automatically every 15 seconds.")).toBeVisible();
  await page.getByRole("textbox", { name: "Filter rows" }).fill("SCHEDULED-PROBE");
  // Nobody presses Check now: the scheduler picks the device up on its own.
  await expect(page.getByRole("row").filter({ hasText: "SCHEDULED-PROBE" })).toContainText("Up", { timeout: 60_000 });

  await toggle("60");
  await close();
});

test("email settings are saved, a test email reaches the mail server, and the outbox shows it", async ({ page }) => {
  const sink = await mailSink();
  try {
    await page.goto("/en/settings/email");
    await expect(page.getByRole("switch", { name: "Send emails" })).toHaveAttribute("aria-checked", "false");
    await page.getByLabel("Mail server").fill("127.0.0.1");
    await page.getByLabel("Port").fill(String(sink.port));
    await choose(page, "Connection security", "None (a relay on port 25)");
    await page.getByLabel("Sender address").fill("itsupport@applus.test");
    await page.getByLabel("App address for links").fill(BASE_URL);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mail server")).toHaveValue("127.0.0.1");

    await expect(page.getByLabel("Send to")).toHaveValue("admin@applus.test");
    await page.getByRole("button", { name: "Send test" }).click();
    await expect(page.getByText("Test email sent to admin@applus.test.")).toBeVisible();
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]).toContain("To: admin@applus.test");
    expect(sink.messages[0]).toContain("From: AP Plus IT <itsupport@applus.test>");

    const item = page.getByRole("list", { name: "Outbox" }).getByRole("listitem").filter({ hasText: "admin@applus.test" }).first();
    await expect(item).toContainText("Test");
    await expect(item).toContainText("Sent");
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Failed" }).click();
    await expect(page.getByText("No emails yet.")).toBeVisible();
    await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "All" }).click();
    await item.getByRole("button", { name: /^View / }).click();
    await expect(page.getByTitle("Email preview")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/en/settings/audit");
    await page.getByRole("textbox", { name: "Filter rows" }).fill("Changed email settings");
    await expect(page.getByRole("cell", { name: "Changed email settings: sending off" })).toBeVisible();
  } finally {
    await sink.close();
  }
});

test("a resolved ticket's email reaches the requester, and its links answer without signing in", async ({ page, browser }) => {
  const sink = await mailSink();
  const email = (await (await page.request.get("/api/settings/email")).json()) as Record<string, unknown>;
  const put = (enabled: boolean) =>
    page.request.put("/api/settings/email", { data: { ...email, hasPassword: undefined, enabled, host: "127.0.0.1", port: sink.port, security: "none" } });
  expect((await put(true)).ok()).toBe(true);
  const visitor = await (await signedOut(browser)).newPage();
  try {
    // Fixed, with a rating, in English.
    const fixed = await resolvedTicket(page, "Printer offline on the second floor");
    await expect.poll(() => sink.messages.filter((m) => m.includes(`To: ${fixed.recipient}`)).length).toBe(1);
    await visitor.goto(`/en/respond/${fixed.token}?answer=fixed`);
    await expect(visitor.getByRole("heading", { name: "Is it fixed?" })).toBeVisible();
    await expect(visitor.getByText("Restarted the print spooler.")).toBeVisible();
    await expect(visitor.getByRole("radio", { name: "Yes, it's fixed" })).toBeChecked();
    await visitor.getByRole("button", { name: "4 out of 5" }).click();
    await visitor.getByRole("button", { name: "Confirm and close the request" }).click();
    await expect(visitor.getByText(/^Thank you\. IT\d{6} is closed\.$/)).toBeVisible();
    expect(await (await page.request.get(`/api/tickets/${fixed.id}`)).json()).toMatchObject({ status: "closed", satisfaction: 4 });
    await visitor.reload();
    await expect(visitor.getByText("This link has already been used.")).toBeVisible();

    // Still a problem, with a reason, in Arabic.
    const notFixed = await resolvedTicket(page, "Scanner not sending to email");
    await visitor.goto(`/ar/respond/${notFixed.token}?answer=not-fixed`);
    await expect(visitor.getByRole("radio", { name: "لا، ما زالت المشكلة قائمة" })).toBeChecked();
    await visitor.getByLabel("ما الذي لا يزال لا يعمل؟").fill("Still nothing arrives.");
    await visitor.getByRole("button", { name: "إعادة فتح الطلب" }).click();
    await expect(visitor.getByRole("status")).toContainText("أُعيد فتح");
    const reopened = (await (await page.request.get(`/api/tickets/${notFixed.id}`)).json()) as { status: string; comments: { body: string }[] };
    expect(reopened.status).toBe("open");
    expect(reopened.comments.at(-1)?.body).toBe("Still nothing arrives.");

    await visitor.goto("/en/respond/not-a-real-link");
    await expect(visitor.getByText("This link does not work. Check that it was copied in full.")).toBeVisible();
  } finally {
    await put(false);
    await visitor.context().close();
    await sink.close();
  }
});

test("the ID card design is uploaded in Settings and shows on every card", async ({ page }) => {
  await page.goto("/en/settings/id-card");
  const side = (title: string) => page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }) });
  const front = side("Front");
  const back = side("Back");
  await expect(front).toContainText("Not uploaded yet");

  // Refused: landscape, and too small to print sharp.
  const upload = async (card: typeof front, side: string, width: number, height: number) => {
    await card.getByLabel(/the design$/).setInputFiles({ name: `${side}.png`, mimeType: "image/png", buffer: png(width, height) });
    await card.getByRole("button", { name: `Upload ${side}` }).click();
  };
  await upload(front, "Front", 1016, 640);
  await expect(front.getByRole("alert")).toHaveText("This image is not in the card's proportions. It should be portrait, 54 × 85.6 mm.");
  await upload(front, "Front", 320, 508);
  await expect(front.getByRole("alert")).toHaveText("This image is too small to print sharp. Use one at least 640 pixels wide.");

  await upload(front, "Front", 640, 1016);
  await expect(front).toContainText("640 × 1016 pixels");
  await upload(back, "Back", 640, 1016);
  await expect(back).toContainText("640 × 1016 pixels");
  await expect(front.locator("svg image")).toHaveAttribute("href", /^\/api\/id-cards\/design\/front\?v=/);

  // Cards show it, front and back.
  await page.goto("/en/people/id-cards");
  await page.locator('table a[href*="/people/id-cards/"]').first().click();
  await expect(page.getByText("The card design is not uploaded yet")).toBeHidden();
  await expect(page.getByRole("img", { name: /^Front of the ID card/ }).locator("image").first()).toHaveAttribute("href", /design\/front/);
  await expect(page.getByRole("img", { name: /^Back of the ID card/ }).locator("image")).toHaveAttribute("href", /design\/back/);

  // Removing a side leaves the card without it.
  await page.goto("/en/settings/id-card");
  await back.getByRole("button", { name: "Remove Back" }).click();
  await expect(back).toContainText("Not uploaded yet");
  await front.getByRole("button", { name: "Remove Front" }).click();
  await expect(front).toContainText("Not uploaded yet");
});

test("a tool that needs approval is asked for, granted by IT, and then opens", async ({ page, browser }) => {
  // Back to every tool on for everyone, whatever an earlier attempt left.
  const start = (await (await page.request.get("/api/tools/admin")).json()) as { requests: { id: number }[]; exceptions: { id: number }[] };
  for (const e of [...start.requests, ...start.exceptions]) await page.request.delete(`/api/tools/exceptions/${e.id}`);
  expect((await page.request.put("/api/settings/tools", { data: {} })).ok()).toBe(true);

  // IT has Merge PDFs ask for approval.
  await page.goto("/en/settings/tools");
  const merge = page.getByRole("group", { name: "Merge PDFs" });
  await expect(merge.getByRole("combobox", { name: "Who may use it" })).toContainText("On for everyone");
  await merge.getByRole("combobox", { name: "Who may use it" }).click();
  await page.getByRole("option", { name: "Needs approval" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Tool settings saved.")).toBeVisible();

  // The employee asks for it.
  const context = await signedOut(browser);
  expect((await context.request.post("/api/auth/sign-in/email", { data: { email: "employee@applus.test", password: DEMO_PASSWORD }, headers: { origin: BASE_URL } })).ok()).toBe(true);
  const employee = await context.newPage();
  await employee.goto("/en/tools");
  const card = employee.locator('[data-slot="card"]').filter({ hasText: "Merge PDFs" });
  await expect(card).toContainText("Needs approval from IT");
  await expect(employee.getByRole("link", { name: "Open" })).toHaveCount(4);
  await card.getByRole("button", { name: "Request access" }).click();
  await employee.getByLabel(/Why do you need it/).fill("Monthly reports come in several parts.");
  await employee.getByRole("button", { name: "Send request" }).click();
  await expect(employee.getByText(/^Request IT\d+ sent to IT\.$/)).toBeVisible();
  await expect(card).toContainText("Requested");
  const requestLink = card.getByRole("link", { name: /^View request IT\d+$/ });
  const ticketId = Number(/\/requests\/(\d+)/.exec((await requestLink.getAttribute("href"))!)![1]);
  await employee.goto("/en/tools/pdf-merge");
  await expect(employee.getByText("Requested")).toBeVisible();
  await expect(employee.getByLabel("Choose files")).toBeHidden();

  // IT grants it; the request's ticket is resolved with the answer.
  await page.reload();
  const requests = page.locator('[data-slot="card"]').filter({ hasText: "Waiting for approval" });
  await expect(requests).toContainText("Nora Al-Otaibi");
  await requests.getByRole("button", { name: "Grant" }).click();
  await expect(page.getByText("Access granted.")).toBeVisible();
  await expect(requests).toContainText("No requests waiting.");
  const people = page.locator('[data-slot="card"]').filter({ hasText: "Allow or block one person" });
  await expect(people).toContainText("Nora Al-Otaibi");
  await expect(people).toContainText("Allowed");
  const ticket = (await (await page.request.get(`/api/tickets/${ticketId}`)).json()) as { status: string; resolution: string };
  expect(ticket.status).toBe("resolved");
  expect(ticket.resolution).toContain("The Merge PDFs tool is now switched on for you.");

  await employee.reload();
  await expect(employee.getByLabel("Choose files")).toBeAttached();

  // Put back as it was.
  await people.getByRole("button", { name: "Remove the exception for Nora Al-Otaibi" }).click();
  await expect(page.getByText("Exception removed.")).toBeVisible();
  await merge.getByRole("combobox", { name: "Who may use it" }).click();
  await page.getByRole("option", { name: "On for everyone" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Tool settings saved.").last()).toBeVisible();
  await context.close();
});
