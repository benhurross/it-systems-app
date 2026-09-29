import { expect, test } from "@playwright/test";
import { session } from "./env";

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
});
