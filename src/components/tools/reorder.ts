"use client";

import { type DragEvent, useState } from "react";

/** The list with one item moved from one place to another. */
export function moved<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Dragging items of a list to put them in another order. Each item spreads `handlers(i)`; the
 * list says which is being dragged and where it would go. Buttons do the same for a keyboard.
 */
export function useDragOrder<T>(items: T[], onChange: (items: T[]) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const end = () => {
    setDragging(null);
    setOver(null);
  };
  const handlers = (i: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragging(i);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    },
    onDragOver: (e: DragEvent) => {
      // Only an item of this list moves here; files dragged in are for the drop area.
      if (dragging === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== i) setOver(i);
    },
    onDrop: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault();
      if (dragging !== i) onChange(moved(items, dragging, i));
      end();
    },
    onDragEnd: end,
  });
  return { handlers, dragging, over };
}
