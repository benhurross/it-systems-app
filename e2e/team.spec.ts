import { expect, test, type Page } from "@playwright/test";
import { session } from "./env";
import { unique, watchConsole } from "./helpers";

// The IT manager gives a task; the member moves it along in My work and marks it done; the manager
// sends it back, then confirms it. A confidential task is seen by the two of them alone, and no
// IT Admin reaches Team Management.

test.use({ storageState: session("admin") });

async function newTask(page: Page, title: string, assignee: string, more: { confidential?: boolean; requester?: string; requesterName?: string } = {}) {
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("combobox", { name: "For" }).click();
  await page.getByRole("option", { name: assignee, exact: true }).click();
  await dialog.getByRole("combobox", { name: "Priority" }).click();
  await page.getByRole("option", { name: "High" }).click();
  if (more.requester) {
    await dialog.getByRole("combobox", { name: "Requested by" }).click();
    await page.getByRole("option", { name: more.requester, exact: true }).click();
  }
  if (more.requesterName) await dialog.getByLabel("Title or name").fill(more.requesterName);
  await dialog.getByLabel(/^Due/).fill("2026-11-20");
  if (more.confidential) await dialog.getByRole("switch", { name: /Confidential/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Task saved.")).toBeVisible();
}

test("a task goes from the manager to the member and back, and is confirmed", async ({ page, browser }, info) => {
  const console = watchConsole(page);
  const title = unique(info, "Prepare the BCM test report");
  await page.goto("/en/team?tab=board");
  await newTask(page, title, "Omar Haddad", { requester: "Executive", requesterName: "CFO" });
  // Saved, it opens: who asked, for whom.
  const sheet = page.locator("[data-task-sheet]");
  await expect(sheet).toContainText("Executive: CFO");
  await expect(sheet).toContainText("Omar Haddad");
  await page.keyboard.press("Escape");
  const card = page.locator("[data-column='todo'] [data-task]").filter({ hasText: title });
  await expect(card).toContainText("Omar Haddad");
  await expect(card).toContainText("High");

  // The member, in My work: starts it, moves its progress, marks it done.
  const member = await browser.newContext({ storageState: session("it") });
  const mine = await member.newPage();
  await mine.goto("/en/my-work");
  await mine.locator("[data-task]").filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  const memberSheet = mine.locator("[data-task-sheet]");
  await memberSheet.getByRole("button", { name: "Start" }).click();
  await expect(memberSheet).toContainText("In progress");
  await memberSheet.getByLabel("Progress").fill("60");
  await memberSheet.getByRole("button", { name: "Save progress" }).click();
  await expect(memberSheet).toContainText("set progress to 60%");
  await memberSheet.getByRole("button", { name: "Mark done" }).click();
  await memberSheet.getByLabel("Anything the manager should know (optional).").fill("Sent to the committee");
  await memberSheet.getByRole("button", { name: "Mark done" }).click();
  await expect(memberSheet).toContainText("marked it done");

  // The manager: a private note, then sends it back with a comment.
  await page.reload();
  await expect(page.getByRole("tab", { name: /1 to review/ })).toHaveAttribute("aria-selected", "true");
  await page.locator("[data-column='done'] [data-task]").filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  await expect(sheet).toContainText("Sent to the committee");
  await sheet.getByRole("switch", { name: "Only the Admins see private notes." }).click();
  await sheet.getByLabel("Private note", { exact: true }).fill("Check the figures with Finance first");
  await sheet.getByRole("button", { name: "Private note" }).click();
  await expect(sheet).toContainText("Check the figures with Finance first");
  await sheet.getByRole("button", { name: "Send back" }).click();
  await sheet.getByLabel("Say what is still to be done: the member sees it.").fill("Add the recovery times");
  await sheet.getByRole("button", { name: "Send back" }).click();
  await expect(sheet).toContainText("sent it back");

  // The member sees why, not the note; does it, marks it done again.
  await mine.reload();
  await mine.locator("[data-task]").filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  await expect(memberSheet).toContainText("Add the recovery times");
  await expect(memberSheet).not.toContainText("Check the figures with Finance first");
  await memberSheet.getByRole("button", { name: "Mark done" }).click();
  await memberSheet.getByRole("button", { name: "Mark done" }).click();
  await expect(memberSheet).toContainText("Done");
  await member.close();

  // Confirmed by the manager.
  await page.reload();
  await page.locator("[data-column='done'] [data-task]").filter({ hasText: title }).getByRole("button", { name: title, exact: true }).click();
  await sheet.getByRole("button", { name: "Confirm" }).click();
  await expect(sheet).toContainText("confirmed it was done");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-column='confirmed'] [data-task]").filter({ hasText: title })).toBeVisible();

  // The dashboard: Omar's workload, the activity of the task.
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/tab=dashboard/);
  const dashboard = page.locator("[data-team-dashboard]");
  await expect(dashboard.locator("[data-member='Omar Haddad']")).toBeVisible();
  await expect(dashboard).toContainText(`confirmed it was done: ${title}`);
  console.assertClean();
});

test("a confidential task is seen by the manager and its member alone; no IT Admin reaches Team Management", async ({ page, browser }, info) => {
  const title = unique(info, "Review access for a leaver");
  await page.goto("/en/team?tab=board");
  await newTask(page, title, "Faisal Al-Qahtani", { confidential: true });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-task]").filter({ hasText: title })).toContainText("Confidential");
  const tasks = (await (await page.request.get("/api/team/tasks")).json()) as { id: number; title: string }[];
  const id = tasks.find((x) => x.title === title)!.id;

  // Another member: not in their work, and not there by its address.
  const other = await browser.newContext({ storageState: session("it") });
  const page2 = await other.newPage();
  await page2.goto("/en/my-work");
  await expect(page2.getByRole("heading", { name: "My work", level: 1 })).toBeVisible();
  await expect(page2.getByText(title)).toHaveCount(0);
  expect((await page2.request.get(`/api/team/tasks/${id}`)).status()).toBe(404);
  await other.close();

  // An IT Admin: no Team Management, by the menu, the page or the API.
  const itAdmin = await browser.newContext({ storageState: session("itAdmin") });
  const page3 = await itAdmin.newPage();
  await page3.goto("/en/");
  await expect(page3.getByRole("link", { name: "My work" })).toBeVisible();
  await expect(page3.getByRole("link", { name: "Team Management" })).toHaveCount(0);
  await page3.goto("/en/team");
  await expect(page3.getByRole("heading", { name: "Not available" })).toBeVisible();
  expect((await page3.request.get(`/api/team/tasks/${id}`)).status()).toBe(404);
  expect((await page3.request.post("/api/team/tasks", { data: { title: "x", assigneeId: "x", requester: "gm", priority: "low" } })).status()).toBe(403);
  expect((await page3.request.get("/api/team/settings")).status()).toBe(403);
  await itAdmin.close();
});

test("a member's plan shows on the manager's planning board", async ({ page, browser }, info) => {
  const title = unique(info, "Security+ exam");
  const member = await browser.newContext({ storageState: session("it") });
  const mine = await member.newPage();
  await mine.goto("/en/my-work");
  const plan = mine.locator("[data-my-plan]");
  await plan.getByRole("button", { name: "Add to my plan" }).click();
  const dialog = mine.getByRole("dialog", { name: "Add to my plan" });
  await dialog.getByRole("combobox", { name: "What" }).click();
  await mine.getByRole("option", { name: "Certification exam" }).click();
  await dialog.getByLabel("Title").fill(title);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  await dialog.getByLabel("From").fill(today);
  await dialog.getByLabel("To").fill(today);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(mine.getByText("Plan saved.")).toBeVisible();
  await expect(plan).toContainText(title);
  await expect(plan).toContainText("Certification exam");
  // Not the manager's to change, nor another member's to see.
  const plans = (await (await mine.request.get(`/api/team/plans?from=${today}&to=${today}`)).json()) as { id: number; title: string }[];
  const id = plans.find((p) => p.title === title)!.id;
  await member.close();

  await page.goto("/en/team?tab=planning");
  const board = page.locator("[data-team-planning]");
  await expect(board.getByRole("row").filter({ hasText: "Omar Haddad" })).toContainText(title);
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await expect(page.locator("[data-member='Omar Haddad']")).toContainText("Certification exam");
  expect((await page.request.delete(`/api/team/plans/${id}`)).status()).toBe(403);
  const other = await browser.newContext({ storageState: session("itAdmin") });
  const theirs = await other.newPage();
  const seen = (await (await theirs.request.get(`/api/team/plans?from=${today}&to=${today}`)).json()) as { title: string }[];
  expect(seen.some((p) => p.title === title)).toBe(false);
  expect((await theirs.request.get("/api/team/dashboard")).status()).toBe(403);
  await other.close();
});
