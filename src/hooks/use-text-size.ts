import { useSyncExternalStore } from "react";
import {
  DEFAULT_TEXT_SIZE,
  parseTextSize,
  stepTextSize,
  TEXT_SIZE_KEY,
  type TextSize,
} from "@/lib/text-size";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const read = () => parseTextSize(localStorage.getItem(TEXT_SIZE_KEY));

export function useTextSize() {
  const size = useSyncExternalStore(subscribe, read, () => DEFAULT_TEXT_SIZE);

  const set = (next: TextSize) => {
    localStorage.setItem(TEXT_SIZE_KEY, String(next));
    document.documentElement.style.fontSize = `${next}%`;
    listeners.forEach((listener) => listener());
  };

  return {
    size,
    set,
    increase: () => set(stepTextSize(size, 1)),
    decrease: () => set(stepTextSize(size, -1)),
    reset: () => set(DEFAULT_TEXT_SIZE),
  };
}
