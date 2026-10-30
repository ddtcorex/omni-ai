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
   * return the point nearest to where a multi-line selection visually ends
   * (the last rect's bottom-right corner) instead of the bounding box of the
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

  /**
   * Place a card next to an anchor (the toolbar or the selection). Opens
   * below the anchor, left-aligned with it, and flips above when it does not
   * fit below and there is more room above. The card is kept inside the
   * viewport horizontally. `anchor` is viewport-relative (a client rect);
   * the returned top/left are document-relative. For "above", `top` is where
   * the card's top edge sits at the given height, so its bottom edge is
   * `anchor.top - gap` (the edge the caller should pin, see content.js).
   * content.js passes an anchor whose `top` is the higher of the toolbar and
   * the selection, so an above card never covers the selected text.
   *
   * @param {{top: number, left: number, bottom: number}} anchor
   * @param {{width: number, height: number}} card
   * @param {{width: number, height: number, scrollX: number, scrollY: number}} viewport
   * @param {number} [gap]
   * @returns {{top: number, left: number, placement: "below" | "above", maxHeight: number}}
   */
  function placeCard(anchor, card, viewport, gap = 8) {
    const margin = 10;
    const maxHeight = viewport.height - 20;
    const height = Math.min(card.height, maxHeight);

    const spaceBelow = viewport.height - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    const placement = height <= spaceBelow || spaceAbove <= spaceBelow ? "below" : "above";

    let viewportTop =
      placement === "below" ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height);
    if (placement === "below" && viewportTop + height > viewport.height - margin) {
      viewportTop = Math.max(margin, viewport.height - margin - height);
    }

    let viewportLeft = anchor.left;
    if (viewportLeft + card.width > viewport.width - margin) {
      viewportLeft = viewport.width - margin - card.width;
    }
    if (viewportLeft < margin) viewportLeft = margin;

    return {
      top: viewportTop + viewport.scrollY,
      left: viewportLeft + viewport.scrollX,
      placement,
      maxHeight,
    };
  }

  /**
   * Which side of the toolbar button the quick actions reveal on: to its
   * right, or to its left when the row would run past the right edge.
   *
   * @param {number} buttonRight viewport-relative right edge of the button
   * @param {number} rowWidth
   * @param {number} viewportWidth
   * @returns {"right" | "left"}
   */
  function revealSide(buttonRight, rowWidth, viewportWidth) {
    const gap = 6;
    return buttonRight + gap + rowWidth > viewportWidth ? "left" : "right";
  }

  root.OMNI_POSITIONING = { clampToViewport, getRectEndPoint, placeCard, revealSide };
})(typeof self !== "undefined" ? self : this);
