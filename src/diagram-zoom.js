/** Zoom arithmetic for the diagram stage, free of the DOM so it can be tested in Node. */

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const ZOOM_STEP = 1.25;

export const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Scale that shows the whole diagram inside `box`, never above 100%. */
export function fitScale(natural, box) {
  if (!natural.width || !natural.height || box.width <= 0 || box.height <= 0) return 1;
  return clampScale(Math.min(1, box.width / natural.width, box.height / natural.height));
}

/**
 * Scroll position that keeps the content point under `anchor` (a point in the
 * visible area) where it is while the scale changes.
 */
export function scrollAfterZoom({ scrollLeft, scrollTop }, anchor, from, to) {
  const ratio = to / from;
  return {
    scrollLeft: (scrollLeft + anchor.x) * ratio - anchor.x,
    scrollTop: (scrollTop + anchor.y) * ratio - anchor.y,
  };
}

/** Scale after a wheel gesture: pinch and Ctrl/Cmd+wheel report small `deltaY` steps. */
export const scaleAfterWheel = (scale, deltaY) => clampScale(scale * Math.exp(-deltaY * 0.01));
