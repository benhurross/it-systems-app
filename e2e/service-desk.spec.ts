import { expect, test, type Browser } from "@playwright/test";
import { session } from "./env";
import { choose, unique, watchConsole } from "./helpers";

/** Opens a page signed in as another role, alongside the test's own. */
async function as(browser: Browser, role: "admin" | "it" | "employee") {
  const context = await browser.newContext({ storageState: session(role) });
  return { page: await context.newPage(), close: () => context.close() };
}

test.describe("IT staff", () => {
  test.use({ storageState: session("it") });

  test("open, work, resolve and close a ticket", async ({ page }, info) => {
    const console = watchConsole(page);
    const subject = unique(info, "Projector will not connect");
    await page.goto("/en/tickets");
    await page.getByRole("link", { name: "New ticket" }).first().click();
    await expect(page).toHaveURL(/\/en\/tickets\/new$/);

    await page.getByRole("combobox", { name: "Requester" }).click();
    await page.getByPlaceholder("Search").fill("Nora");
    await page.getByRole("option", { name: /Nora Al-Otaibi/ }).click();
    // The requester's location is filled in for us.
    await expect(page.getByRole("combobox", { name: "Location" })).toContainText("Jeddah Head Office");
    await choose(page, "Issue type", "Hardware");
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("What is happening?").fill("The meeting room projector shows no signal.");
    await page.getByRole("button", { name: "Open ticket" }).click();

    await expect(page).toHaveURL(/\/en\/tickets\/\d+$/);
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Due in")).toBeVisible();

    await page.getByRole("button", { name: "Start work" }).click();
    await expect(page.getByText("In progress", { exact: true }).first()).toBeVisible();

    await page.getByRole("textbox", { name: "Add a message" }).fill("On my way to the meeting room.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("On my way to the meeting room.")).toBeVisible();

    await page.getByRole("button", { name: "Resolve" }).click();
    await page.getByRole("dialog").getByLabel("How was it fixed?").fill("Replaced the HDMI cable.");
    await page.getByRole("dialog").getByRole("button", { name: "Resolve" }).click();
    await expect(page.getByText("Replaced the HDMI cable.")).toBeVisible();
    await expect(page.getByText("Met", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
    await expect(page.getByText(/status closed/)).toBeVisible();
    console.assertClean();
  });

  test("reporting an incident starts at high priority", async ({ page }) => {
    await page.goto("/en/tickets");
    await page.getByRole("link", { name: "Report incident" }).click();
    await expect(page.getByRole("heading", { name: "Report incident" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Type", exact: true })).toContainText("Incident");
    await expect(page.getByRole("combobox", { name: "Priority" })).toContainText("High");
  });

  test("the queue filters by tab and by status", async ({ page }) => {
    const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await page.goto("/en/tickets");

    await page.getByRole("tab", { name: /Incidents/ }).click();
    await expect(rows.first()).toContainText("Incident");
    await expect(page.getByRole("cell", { name: "Request", exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: /^All/ }).click();
    await page.getByRole("button", { name: "Status", expanded: false }).click();
    await page.getByRole("menuitemcheckbox", { name: /On hold/ }).click();
    await page.keyboard.press("Escape");
    // Filtering is instant, so wait for the narrowed range before reading the rows.
    await expect(page.getByText(/^1–\d of \d$/)).toBeVisible();
    for (const row of await rows.all()) await expect(row).toContainText("On hold");
  });

  test("a ticket suggests articles for its issue type", async ({ page }) => {
    await page.goto("/en/tickets");
    await page.getByRole("button", { name: "Issue type", expanded: false }).click();
    await page.getByRole("menuitemcheckbox", { name: /Email/ }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("row").nth(1).getByRole("link").click();
    await expect(page.getByRole("link", { name: "Outlook says the mailbox is full" })).toBeVisible();
  });

  test("a change goes from request to approval to implemented", async ({ page }, info) => {
    const title = unique(info, "Replace UPS batteries");
    await page.goto("/en/changes");
    await page.getByRole("button", { name: "New change" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Planned for").fill("2026-10-15T21:00");
    await dialog.getByLabel("Description").fill("Swap both battery packs in the server room UPS.");
    await dialog.getByLabel("Reason").fill("Batteries hold 80% of their charge.");
    await dialog.getByLabel("Rollback plan").fill("Refit the old packs.");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Awaiting approval")).toBeVisible();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Record result" }).click();
    await choose(page, "Result", "Rolled back");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Implemented", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("This change is closed and can no longer be edited.")).toBeVisible();
  });

  test("knowledge articles are written and published", async ({ page }, info) => {
    const title = unique(info, "Resetting the meeting room screen");
    await page.goto("/en/knowledge");
    await page.getByRole("link", { name: "New article" }).click();
    await page.getByLabel("Title").fill(title);
    await choose(page, "Category", "Hardware");
    await choose(page, "Status", "Published");
    await page.getByLabel("Symptoms").fill("The screen stays black.");
    await page.getByLabel("Resolution").fill("Hold the power button for ten seconds.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("link", { name: "All articles" }).click();
    await page.getByRole("searchbox", { name: "Search articles" }).fill(title);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });
});

test.describe("employees", () => {
  test.use({ storageState: session("employee") });

  test("raise a request, have it resolved, confirm it with a rating", async ({ page, browser }, info) => {
    const console = watchConsole(page);
    const subject = unique(info, "Need a second monitor");
    await page.goto("/en/requests");
    await page.getByRole("link", { name: "New request" }).first().click();
    await page.getByRole("radio", { name: /I need something/ }).click();
    await choose(page, "Issue type", "Other request");
    await choose(page, "Location", "Jeddah Head Office");
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("What is happening?").fill("A second screen for spreadsheets, please.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    const id = page.url().split("/").pop()!;

    // IT resolves it.
    const it = await as(browser, "it");
    const res = await it.page.request.patch(`/api/tickets/${id}`, { data: { status: "resolved", resolution: "Delivered and connected." } });
    expect(res.ok()).toBe(true);
    await it.close();

    await page.reload();
    await expect(page.getByText("Is it fixed?")).toBeVisible();
    await page.getByRole("button", { name: "4 out of 5" }).click();
    await page.getByRole("button", { name: "Yes, it is fixed" }).click();
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Is it fixed?")).toHaveCount(0);

    await page.goto("/en/requests");
    await expect(page.getByRole("row", { name: new RegExp(subject) })).toContainText("Closed");
    console.assertClean();
  });

  test("only their own tickets and published articles are visible", async ({ page, browser }) => {
    await page.goto("/en/requests");
    const rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
    await expect(rows.first()).toBeVisible();

    const it = await as(browser, "it");
    const all = (await (await it.page.request.get("/api/tickets")).json()) as { id: number; requesterName: string }[];
    await it.close();
    const someoneElse = all.find((x) => x.requesterName !== "Nora Al-Otaibi")!;
    expect((await page.request.get(`/api/tickets/${someoneElse.id}`)).status()).toBe(404);
    await page.goto(`/en/requests/${someoneElse.id}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    await page.goto("/en/knowledge");
    await expect(page.getByRole("link", { name: "Outlook says the mailbox is full" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Laptop battery not charging" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New article" })).toHaveCount(0);
  });

  test("IT pages are closed to employees", async ({ page }) => {
    await page.goto("/en/tickets");
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
    await page.goto("/en/changes");
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  });

  test("the request form works in Arabic", async ({ page }) => {
    await page.goto("/ar/requests/new");
    await expect(page.getByRole("heading", { name: "اطلب المساعدة من فريق التقنية" })).toBeVisible();
    await page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(page.getByText("هذا الحقل مطلوب").first()).toBeVisible();
  });
});
