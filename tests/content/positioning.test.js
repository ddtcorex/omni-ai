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
});
