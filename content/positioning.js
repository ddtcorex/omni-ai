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

  /**
   * Where the floating toolbar may sit for a rich-text selection, best first,
   * viewport-relative. The first is right of the selection's end, vertically
   * centred on its last line, or left of its start on the first line when the
   * right side runs past the viewport. The rest are fallbacks for when a host
   * element covers it: above that line, then the other side. A selection
   * toolbar an editor anchors to the selection never sits on the selection's
   * own line, so the first spot is usually clear.
   *
   * @param {DOMRectList | DOMRect[]} rects Range.getClientRects()
   * @param {number} size the toolbar's (square) size at rest
   * @param {number} viewportWidth
   * @param {number} [gap]
   * @returns {{top: number, left: number, side: string}[]} side is "right", "left" or "above"
   */
  function toolbarCandidates(rects, size, viewportWidth, gap = 4) {
    // A selection that ends at the start of a block adds an empty rect there.
    const lines = Array.from(rects || []).filter((r) => r.width > 0 && r.height > 0);
    if (lines.length === 0) return [];
    const first = lines[0];
    const last = lines[lines.length - 1];
    const centred = (line) => line.top + line.height / 2 - size / 2;
    const right = { top: centred(last), left: last.right + gap, side: "right" };
    const left = { top: centred(first), left: first.left - gap - size, side: "left" };
    const fitsRight = right.left + size <= viewportWidth;
    const fitsLeft = left.left >= 0;
    if (fitsRight) {
      const above = { top: last.top - gap - size, left: last.right - size, side: "above" };
      return fitsLeft ? [right, above, left] : [right, above];
    }
    const above = { top: first.top - gap - size, left: first.left, side: "above" };
    return fitsLeft ? [left, above] : [right, above];
  }

  /**
   * A grid of points over a rect, inset from its edges, for hit-testing.
   *
   * @param {{left: number, top: number, width: number, height: number}} rect
   * @param {number} cols
   * @param {number} rows
   * @param {number} [inset]
   * @returns {{x: number, y: number}[]}
   */
  function samplePoints(rect, cols, rows, inset = 2) {
    const axis = (start, length, count) => {
      if (count <= 1) return [start + length / 2];
      const step = (length - 2 * inset) / (count - 1);
      return Array.from({ length: count }, (_, i) => start + inset + step * i);
    };
    const xs = axis(rect.left, rect.width, cols);
    const ys = axis(rect.top, rect.height, rows);
    return ys.flatMap((y) => xs.map((x) => ({ x, y })));
  }

  /**
   * Move a card clear of a host element covering it (an editor's own
   * selection toolbar in the parent document), keeping it off the selection.
   * Tries the card's current side first: below starts under the lower of the
   * cover and the anchor, above ends over the higher of the two. All values
   * are viewport-relative. Null when neither side has room for the card.
   *
   * @param {{top: number, height: number}} card
   * @param {"below" | "above"} placement
   * @param {{top: number, bottom: number}} cover
   * @param {{top: number, bottom: number}} anchor toolbar or selection
   * @param {number} viewportHeight
   * @param {number} [gap]
   * @param {number} [margin]
   * @returns {{placement: "below", top: number} | {placement: "above", bottom: number} | null}
   */
  function clearOfCover(card, placement, cover, anchor, viewportHeight, gap = 8, margin = 10) {
    const belowTop = Math.max(cover.bottom, anchor.bottom) + gap;
    const below =
      belowTop + card.height <= viewportHeight - margin
        ? { placement: /** @type {"below"} */ ("below"), top: belowTop }
        : null;
    const aboveBottom = Math.min(cover.top, anchor.top) - gap;
    const above =
      aboveBottom - card.height >= margin
        ? { placement: /** @type {"above"} */ ("above"), bottom: aboveBottom }
        : null;
    return placement === "above" ? above || below : below || above;
  }

  root.OMNI_POSITIONING = {
    clampToViewport,
    getRectEndPoint,
    placeCard,
    revealSide,
    toolbarCandidates,
    samplePoints,
    clearOfCover,
  };
})(typeof self !== "undefined" ? self : this);
