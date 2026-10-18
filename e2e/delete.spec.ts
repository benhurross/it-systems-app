import { expect, test, type Page } from "@playwright/test";
import { session } from "./env";
import { unique, watchConsole } from "./helpers";

test.use({ storageState: session("it") });

/** Makes a record through the API, as the app's forms would, and gives back its number. */
async function make(page: Page, path: string, body: Record<string, unknown>) {
  const res = await page.request.post(`/api${path}`, { data: body });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: number }).id;
}

/** Delete, asked first: Keep it changes nothing; Delete removes it and says so. */
async function deleteIt(page: Page, name: string) {
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: `Delete ${name}?` })).toBeVisible();
  await expect(dialog).toContainText("only restoring a backup brings it back");
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${name} deleted.`)).toBeVisible();
}

test("a project is deleted with its tasks, from its page", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "Old demo project");
  const id = await make(page, "/projects", { name, status: "planned" });
  await make(page, `/projects/${id}/tasks`, { title: "A task", status: "todo" });
  await page.goto(`/en/projects/${id}`);
  await deleteIt(page, name);
  await expect(page).toHaveURL(/\/en\/projects$/);
  expect((await page.request.get(`/api/projects/${id}`)).status()).toBe(404);
  console.assertClean();
});

test("a change and a knowledge article are deleted from their pages", async ({ page }, info) => {
  const console = watchConsole(page);
  const title = unique(info, "Old demo change");
  const change = await make(page, "/changes", {
    title, description: "Swap the switch.", reason: "Old.", risk: "low", rollbackPlan: "Put it back.", plannedAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await page.goto(`/en/changes/${change}`);
  await deleteIt(page, `CHG-${String(change).padStart(3, "0")} ${title}`);
  await expect(page).toHaveURL(/\/en\/changes$/);
  expect((await page.request.get(`/api/changes/${change}`)).status()).toBe(404);

  const article = unique(info, "Old demo article");
  const kb = await make(page, "/kb", { title: article, category: "email", symptoms: "It fails.", resolution: "Restart it.", status: "published" });
  await page.goto(`/en/knowledge/${kb}`);
  await deleteIt(page, article);
  await expect(page).toHaveURL(/\/en\/knowledge$/);
  expect((await page.request.get(`/api/kb/${kb}`)).status()).toBe(404);
  console.assertClean();
});

test("a risk and a vulnerability are deleted from their edit dialogs", async ({ page }, info) => {
  const console = watchConsole(page);
  const risk = unique(info, "Old demo risk");
  await make(page, "/risks", { title: risk, category: "it", description: "Made up.", likelihood: 2, impact: 2, status: "open" });
  await page.goto("/en/risk/register");
  await page.getByRole("button", { name: risk }).click();
  await deleteIt(page, risk);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: risk })).toHaveCount(0);

  const vuln = unique(info, "Old demo vulnerability");
  const today = new Date().toISOString().slice(0, 10);
  await make(page, "/vulnerabilities", { title: vuln, severity: "low", detectedOn: today, deadline: today, status: "open" });
  await page.goto("/en/risk/vulnerabilities");
  await page.getByRole("button", { name: vuln }).click();
  await deleteIt(page, vuln);
  await expect(page.getByRole("button", { name: vuln })).toHaveCount(0);
  console.assertClean();
});

test("an asset is deleted with its documents and installs, and a licence too", async ({ page }, info) => {
  const console = watchConsole(page);
  const name = unique(info, "LT-WRONG");
  const asset = await make(page, "/assets", {
    name, category: "end_user", type: "laptop", status: "in_stock", location: "jeddah", supportStatus: "supported", criticality: "low", monitorMethod: "none",
  });
  const upload = await page.request.post("/api/attachments", {
    multipart: { entity: "asset", entityId: String(asset), kind: "invoice", file: { name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") } },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const product = unique(info, "Old demo software");
  const license = await make(page, "/licenses", { product, type: "subscription", seats: 5 });
  expect((await page.request.post(`/api/licenses/${license}/installs`, { data: { assetId: asset } })).ok()).toBe(true);

  // Retire stays for real devices; Delete says what goes with it.
  await page.goto(`/en/assets/${asset}`);
  await expect(page.getByRole("button", { name: "Retire" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("To keep its history, retire it instead.");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${name} deleted.`)).toBeVisible();
  await expect(page).toHaveURL(/\/en\/assets\/inventory$/);
  expect((await page.request.get(`/api/assets/${asset}`)).status()).toBe(404);
  const documents = (await (await page.request.get(`/api/attachments?entity=asset&id=${asset}`)).json()) as unknown[];
  expect(documents).toEqual([]);

  await page.goto(`/en/software/${license}`);
  await deleteIt(page, product);
  await expect(page).toHaveURL(/\/en\/software$/);
  expect((await page.request.get(`/api/licenses/${license}`)).status()).toBe(404);
  console.assertClean();
});

test("employees cannot delete what IT keep", async ({ browser }) => {
  const context = await browser.newContext({ storageState: session("employee") });
  const res = await context.request.delete("/api/projects/1");
  expect(res.status()).toBe(403);
  await context.close();
});
