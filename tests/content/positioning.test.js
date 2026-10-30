describe("positioning helpers", () => {
  let positioning;

  beforeEach(() => {
    jest.resetModules();
    global.self = global;
    require("../../content/positioning.js");
    positioning = global.OMNI_POSITIONING;
  });

  describe("clampToViewport", () => {
    test("leaves a position that already fits untouched", () => {
      const result = positioning.clampToViewport(100, 100, 50, 30, 0, 0, 1024, 768);
      expect(result).toEqual({ top: 100, left: 100 });
    });

    test("flips left when the element would overflow the right edge", () => {
      const result = positioning.clampToViewport(100, 1000, 50, 30, 0, 0, 1024, 768);
      expect(result.left).toBe(1024 - 50);
    });

    test("flips up when the element would overflow the bottom edge", () => {
      const result = positioning.clampToViewport(750, 100, 50, 30, 0, 0, 1024, 768);
      expect(result.top).toBe(768 - 30);
    });

    test("clamps to 0 when the element is wider/taller than the viewport itself", () => {
      const result = positioning.clampToViewport(0, 0, 2000, 2000, 0, 0, 1024, 768);
      expect(result).toEqual({ top: 0, left: 0 });
    });

    test("accounts for scroll offset in the returned document-relative position", () => {
      const result = positioning.clampToViewport(100, 1000, 50, 30, 200, 300, 1024, 768);
      // viewportLeft = 1000 - 200 = 800; 800 + 50 = 850 < 1024, so no clamp needed here
      // viewportTop = 100 - 300 = -200 (above viewport); clamped to 0, so doc-relative becomes 0 + 300 = 300
      expect(result.left).toBe(1000);
      expect(result.top).toBe(300);
    });
  });

  describe("getRectEndPoint", () => {
    test("returns null for an empty rect list", () => {
      expect(positioning.getRectEndPoint([])).toBeNull();
    });

    test("returns the single rect's bottom-right corner for a one-line selection", () => {
      const rect = { top: 10, left: 20, bottom: 30, right: 120 };
      expect(positioning.getRectEndPoint([rect])).toEqual({ top: 30, left: 120 });
    });

    test("returns the LAST rect's corner (not the bounding box) for a multi-line selection", () => {
      const firstLine = { top: 10, left: 20, bottom: 30, right: 500 };
      const lastLine = { top: 40, left: 20, bottom: 60, right: 90 };
      expect(positioning.getRectEndPoint([firstLine, lastLine])).toEqual({ top: 60, left: 90 });
    });
  });

  describe("placeCard", () => {
    const viewport = { width: 1024, height: 768, scrollX: 0, scrollY: 0 };
    const card = { width: 320, height: 200 };

    test("placeCard opens below the anchor when it fits", () => {
      const result = positioning.placeCard({ top: 100, left: 50, bottom: 124 }, card, viewport);
      expect(result).toEqual({ top: 132, left: 50, placement: "below", maxHeight: 748 });
    });

    test('placeCard opens above when there is no room below and reports placement "above"', () => {
      const result = positioning.placeCard({ top: 700, left: 50, bottom: 724 }, card, viewport);
      expect(result.placement).toBe("above");
      // Card bottom edge sits one gap above the anchor top.
      expect(result.top + card.height).toBe(700 - 8);
    });

    test("placeCard caps maxHeight at the viewport height minus 20", () => {
      const result = positioning.placeCard(
        { top: 100, left: 50, bottom: 124 },
        { width: 320, height: 2000 },
        viewport,
      );
      expect(result.maxHeight).toBe(768 - 20);
    });

    test("placeCard keeps the card inside the right edge", () => {
      const result = positioning.placeCard({ top: 100, left: 1000, bottom: 124 }, card, viewport);
      expect(result.left + card.width).toBeLessThanOrEqual(1024 - 10);
    });

    test("placeCard returns document-relative coordinates when scrolled", () => {
      const result = positioning.placeCard({ top: 100, left: 50, bottom: 124 }, card, {
        ...viewport,
        scrollX: 30,
        scrollY: 500,
      });
      expect(result.top).toBe(500 + 132);
      expect(result.left).toBe(30 + 50);
    });
  });

  describe("revealSide", () => {
    test('revealSide returns "right" when the row fits to the right of the button', () => {
      expect(positioning.revealSide(100, 120, 1024)).toBe("right");
    });

    test('revealSide returns "left" when the row would overflow the right edge', () => {
      expect(positioning.revealSide(1000, 120, 1024)).toBe("left");
    });
  });

  describe("lastLineStart", () => {
    const rect = (left, top, width, height = 20) => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });

    test("is the left edge of a single line selection", () => {
      expect(positioning.lastLineStart([rect(120, 40, 80)])).toBe(120);
    });

    test("is the leftmost rect on the last line, not the first line", () => {
      const rects = [
        rect(150, 40, 100),
        rect(40, 64, 200),
        rect(40, 88, 60),
        rect(100, 89, 30, 18),
      ];
      expect(positioning.lastLineStart(rects)).toBe(40);
    });

    test("ignores the empty rect a selection ending at a block start adds", () => {
      const rects = [rect(150, 40, 100), rect(60, 64, 90), rect(20, 88, 0)];
      expect(positioning.lastLineStart(rects)).toBe(60);
    });

    test("is null with no measurable rects", () => {
      expect(positioning.lastLineStart([])).toBeNull();
      expect(positioning.lastLineStart(null)).toBeNull();
    });
  });

  describe("toolbarCandidates", () => {
    const rect = (left, top, width, height) => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });

    test("puts the button right of the selection end, centred on the last line", () => {
      const rects = [rect(40, 100, 300, 20), rect(10, 120, 80, 20)];
      const [first] = positioning.toolbarCandidates(rects, 24, 1024);
      expect(first).toEqual({ top: 120 + 10 - 12, left: 90 + 4, side: "right" });
    });

    test("falls back to above the last line, then left of the start", () => {
      const rects = [rect(40, 100, 300, 20), rect(10, 120, 80, 20)];
      const list = positioning.toolbarCandidates(rects, 24, 1024);
      expect(list.slice(1)).toEqual([
        { top: 120 - 4 - 24, left: 90 - 24, side: "above" },
        { top: 100 + 10 - 12, left: 40 - 4 - 24, side: "left" },
      ]);
    });

    test("starts left of the selection start when the right side does not fit", () => {
      const rects = [rect(400, 50, 590, 20)];
      const list = positioning.toolbarCandidates(rects, 24, 1000);
      expect(list[0]).toEqual({ top: 50 + 10 - 12, left: 400 - 4 - 24, side: "left" });
      expect(list[1]).toEqual({ top: 50 - 4 - 24, left: 400, side: "above" });
      expect(list).toHaveLength(2);
    });

    test("ignores empty boundary rects a selection ending at a block start produces", () => {
      const rects = [rect(10, 100, 120, 20), rect(10, 120, 0, 20)];
      const [first] = positioning.toolbarCandidates(rects, 24, 1024);
      expect(first).toEqual({ top: 100 + 10 - 12, left: 130 + 4, side: "right" });
    });

    test("returns nothing without a measurable rect", () => {
      expect(positioning.toolbarCandidates([], 24, 1024)).toEqual([]);
      expect(positioning.toolbarCandidates([rect(0, 0, 0, 0)], 24, 1024)).toEqual([]);
    });
  });

  describe("samplePoints", () => {
    test("spreads a grid over the rect, inset from its edges", () => {
      const points = positioning.samplePoints(
        { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 },
        3,
        2,
      );
      expect(points).toEqual([
        { x: 2, y: 2 },
        { x: 50, y: 2 },
        { x: 98, y: 2 },
        { x: 2, y: 18 },
        { x: 50, y: 18 },
        { x: 98, y: 18 },
      ]);
    });
  });

  describe("clearOfCover", () => {
    const card = { top: 50, left: 20, width: 300, height: 200 };
    const anchor = { top: 20, bottom: 42 };

    test("moves a below card under the covering element", () => {
      const cover = { top: 46, bottom: 94, left: 0, right: 258 };
      expect(positioning.clearOfCover(card, "below", cover, anchor, 600)).toEqual({
        placement: "below",
        top: 94 + 8,
      });
    });

    test("opens above the selection when there is no room under the cover", () => {
      const tall = { ...card, top: 300, height: 200 };
      const cover = { top: 310, bottom: 360, left: 0, right: 258 };
      const result = positioning.clearOfCover(tall, "below", cover, { top: 270, bottom: 292 }, 500);
      expect(result).toEqual({ placement: "above", bottom: 270 - 8 });
    });

    test("keeps an above card above, clear of a cover over its lower part", () => {
      const above = { top: 100, left: 20, width: 300, height: 150 };
      const cover = { top: 230, bottom: 270, left: 0, right: 258 };
      const result = positioning.clearOfCover(
        above,
        "above",
        cover,
        { top: 280, bottom: 300 },
        800,
      );
      expect(result).toEqual({ placement: "above", bottom: 230 - 8 });
    });

    test("never moves a below card up over the selection", () => {
      const cover = { top: 0, bottom: 30, left: 0, right: 258 };
      expect(positioning.clearOfCover(card, "below", cover, anchor, 600)).toEqual({
        placement: "below",
        top: 42 + 8,
      });
    });

    test("gives up when neither side has room", () => {
      const cover = { top: 46, bottom: 500, left: 0, right: 258 };
      expect(positioning.clearOfCover(card, "below", cover, anchor, 600)).toBeNull();
    });
  });
});
