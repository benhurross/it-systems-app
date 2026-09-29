import { expect, type Page, type TestInfo } from "@playwright/test";

/** Fails the test if the page logs an error to the console. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
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
