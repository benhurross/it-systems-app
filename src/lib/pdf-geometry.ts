import type { PDFPage } from "pdf-lib";

/**
 * A page as it is shown: by its crop box, turned as its rotation says. Its size as shown, where a
 * point as shown (from the bottom left, in points) lands in the page's own coordinates, and back.
 */
export function asShown(page: PDFPage) {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const box = page.getCropBox();
  const { width: W, height: H } = box;
  const turned = rotation === 90 || rotation === 270;
  const size = turned ? { width: H, height: W } : { width: W, height: H };
  const point = (dx: number, dy: number) => {
    const p = rotation === 90 ? { x: W - dy, y: dx } : rotation === 180 ? { x: W - dx, y: H - dy } : rotation === 270 ? { x: dy, y: H - dx } : { x: dx, y: dy };
    return { x: box.x + p.x, y: box.y + p.y };
  };
  const fromPage = (px: number, py: number) => {
    const [x, y] = [px - box.x, py - box.y];
    return rotation === 90 ? { x: y, y: W - x } : rotation === 180 ? { x: W - x, y: H - y } : rotation === 270 ? { x: H - y, y: x } : { x, y };
  };
  return { size, point, fromPage, rotation };
}

/** A box on the page, in its own coordinates, as fractions of the page as shown, from its top left. */
export function shownBox(page: PDFPage, rect: { x: number; y: number; width: number; height: number }) {
  const view = asShown(page);
  const corners = [
    view.fromPage(rect.x, rect.y),
    view.fromPage(rect.x + rect.width, rect.y + rect.height),
  ];
  const [left, right] = [Math.min(corners[0].x, corners[1].x), Math.max(corners[0].x, corners[1].x)];
  const [bottom, top] = [Math.min(corners[0].y, corners[1].y), Math.max(corners[0].y, corners[1].y)];
  return {
    x: left / view.size.width,
    y: 1 - top / view.size.height,
    width: (right - left) / view.size.width,
    height: (top - bottom) / view.size.height,
  };
}
