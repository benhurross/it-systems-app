import { expect, test, type Page } from "@playwright/test";
import { TEXT_SIZE_KEY, TEXT_SIZES } from "../src/lib/text-size";
import { session } from "./env";
import { ALLOWED, resolve } from "./routes";

// At the largest text size, every page fits a phone, a tablet and a desktop screen: the page never
// scrolls sideways (tables and tab strips may, inside their own box) and no control is cut off.

const WIDTHS = [375, 768, 1280];
const LARGEST = TEXT_SIZES.at(-1)!;

test.use({ storageState: session("admin") });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([key, size]) => localStorage.setItem(key, size), [TEXT_SIZE_KEY, String(LARGEST)] as const);
});

/** What is wrong with the layout on screen now, described for a person to find it. */
function layoutProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const name = (el: Element) =>
      `<${el.tagName.toLowerCase()}> "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`;
    const overflow = (el: Element) => getComputedStyle(el).overflowX;
    const scrolls = (el: Element) => ["auto", "scroll"].includes(overflow(el));
    const clips = (el: Element) => ["hidden", "clip"].includes(overflow(el)) || ["hidden", "clip"].includes(getComputedStyle(el).overflowY);

    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + 1) problems.push(`the page scrolls sideways (${root.scrollWidth}px in ${root.clientWidth}px)`);

    for (const el of document.querySelectorAll("body *")) {
      const sideways = scrolls(el) && el.scrollWidth > el.clientWidth + 1;
      // Tables, tab strips and the CMDB map scroll or pan inside their own box by design.
      if (sideways && !el.querySelector("table") && el.tagName !== "NAV" && !el.closest(".react-flow")) {
        problems.push(`${name(el)} scrolls sideways (${el.scrollWidth}px in ${el.clientWidth}px)`);
      }
    }

    const controls = document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="combobox"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"]',
    );
    for (const el of controls) {
      if (el.closest(".react-flow")) continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1 || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      // Only controls that show text: a checkbox's or switch's enlarged touch area also reads as overflow.
      const labelled = el.tagName !== "TEXTAREA" && el.tagName !== "INPUT" && el.textContent!.trim() !== "";
      if (labelled && el.scrollWidth > el.clientWidth + 1) {
        problems.push(`${name(el)} is too narrow for its label (${el.scrollWidth}px in ${el.clientWidth}px)`);
      }
      let scrolled = false;
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (scrolls(parent)) {
          scrolled = true;
          break;
        }
        if (!clips(parent)) continue;
        const edge = parent.getBoundingClientRect();
        if (box.left < edge.left - 1 || box.right > edge.right + 1 || box.top < edge.top - 1 || box.bottom > edge.bottom + 1) {
          problems.push(`${name(el)} is cut off by its container`);
          break;
        }
      }
      if (!scrolled && (box.left < -1 || box.right > innerWidth + 1)) problems.push(`${name(el)} is off the side of the screen`);
    }
    return [...new Set(problems)];
  });
}

for (const route of ALLOWED.admin) {
  test(`${route} fits every screen at the largest text size`, async ({ page }) => {
    const path = await resolve(page, route);
    const problems: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ["en", "ar"]) {
        await page.goto(`/${locale}${path === "/" ? "" : path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe(`${LARGEST}%`);
        problems.push(...(await layoutProblems(page)).map((p) => `${locale} at ${width}px: ${p}`));
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
