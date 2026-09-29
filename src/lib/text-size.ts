/** Root font size steps, as a percentage of the browser's own base size. */
export const TEXT_SIZES = [87.5, 100, 112.5, 125, 137.5] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = 100;
export const TEXT_SIZE_KEY = "text-size";

export function parseTextSize(value: string | null): TextSize {
  const size = Number(value);
  return TEXT_SIZES.find((s) => s === size) ?? DEFAULT_TEXT_SIZE;
}

/** One step larger (1) or smaller (-1), clamped to the available steps. */
export function stepTextSize(current: TextSize, step: 1 | -1): TextSize {
  const index = TEXT_SIZES.indexOf(current) + step;
  return TEXT_SIZES[Math.min(Math.max(index, 0), TEXT_SIZES.length - 1)];
}

/** Runs before first paint so a stored size never flashes at the default. */
export const TEXT_SIZE_SCRIPT = `try{var s=Number(localStorage.getItem("${TEXT_SIZE_KEY}"));if([${TEXT_SIZES.join(",")}].indexOf(s)>-1)document.documentElement.style.fontSize=s+"%"}catch(e){}`;
