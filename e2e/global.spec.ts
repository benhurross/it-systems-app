import { expect, test } from "@playwright/test";
import { session } from "./env";
import { BASE_URL } from "./env";
import { addTcpDevice, choose, listen, mailSink } from "./helpers";

// Journeys that change system-wide settings. They run once, in their own project, so parallel
// browsers never race over the same value.
test.describe.configure({ mode: "serial" });
test.use({ storageState: session("admin") });

test("an SLA change applies to tickets opened afterwards", async ({ page }) => {
  await page.goto("/en/settings/service-desk");
  const critical = page.getByLabel("Critical (Hours)");
  await expect(critical).toHaveValue("4");
  await critical.fill("2");
  await page.getByRole("button", { name: "Save" }).click();
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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved.").last()).toBeVisible();

  // Both saves are in the audit log.
  await page.goto("/en/settings/audit");
  await page.getByRole("textbox", { name: "Filter rows" }).fill("Changed sla settings");
  await expect(page.getByRole("cell", { name: "Changed sla settings" })).toHaveCount(2);
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

    const row = page.getByRole("row").filter({ hasText: "admin@applus.test" }).first();
    await expect(row).toContainText("Test");
    await expect(row).toContainText("Sent");
    await row.getByRole("button", { name: "View" }).click();
    await expect(page.getByTitle("Email preview")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/en/settings/audit");
    await page.getByRole("textbox", { name: "Filter rows" }).fill("Changed email settings");
    await expect(page.getByRole("cell", { name: "Changed email settings: sending off" })).toBeVisible();
  } finally {
    await sink.close();
  }
});
