/**
 * Omni AI positioning helpers.
 *
 * This is a classic script because Manifest V3 content scripts are not ES
 * modules. It is loaded before content/content.js and exposed on `self`,
 * mirroring content/editor-adapters.js's pattern.
 */
(function registerPositioning(root) {
  "use strict";

  /**
   * Clamp a proposed (top, left) document-relative position so the element
   * it positions stays fully inside the current viewport, flipping to the
   * opposite side of its own footprint when the naive position would
   * overflow. Coordinates and the returned position are document-relative
   * (i.e. already include scrollX/scrollY), matching how content.js already
   * computes top/left for the floating button and result overlay.
   *
   * @param {number} top
   * @param {number} left
   * @param {number} width
   * @param {number} height
   * @param {number} scrollX
   * @param {number} scrollY
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @returns {{top: number, left: number}}
   */
  function clampToViewport(
    top,
    left,
    width,
    height,
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
  ) {
    const viewportTop = top - scrollY;
    const viewportLeft = left - scrollX;

    let clampedViewportLeft = viewportLeft;
    if (viewportLeft + width > viewportWidth) {
      clampedViewportLeft = viewportWidth - width;
    }
    if (clampedViewportLeft < 0) {
      clampedViewportLeft = 0;
    }

    let clampedViewportTop = viewportTop;
    if (viewportTop + height > viewportHeight) {
      clampedViewportTop = viewportHeight - height;
    }
    if (clampedViewportTop < 0) {
      clampedViewportTop = 0;
    }

    return {
      top: clampedViewportTop + scrollY,
      left: clampedViewportLeft + scrollX,
    };
  }

  /**
   * Given the list of client rects a Range produces (Range.getClientRects()),
   * return the point nearest to where a multi-line selection visually ends —
   * the last rect's bottom-right corner — instead of the bounding box of the
   * whole selection. Falls back to a single rect's own bottom-right corner
   * when there's only one (the common single-line case).
   *
   * @param {DOMRectList | DOMRect[]} rects
   * @returns {{top: number, left: number} | null}
   */
  function getRectEndPoint(rects) {
    if (!rects || rects.length === 0) return null;
    const last = rects[rects.length - 1];
    return { top: last.bottom, left: last.right };
  }

  root.OMNI_POSITIONING = { clampToViewport, getRectEndPoint };
})(typeof self !== "undefined" ? self : this);
