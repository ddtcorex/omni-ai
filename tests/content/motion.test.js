describe("motion helpers", () => {
  let motion;
  let calls;
  let reduced;
  let supportsLinear;

  function deferred() {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    jest.resetModules();
    global.self = global;
    calls = [];
    reduced = false;
    supportsLinear = true;
    Element.prototype.animate = jest.fn(function animate(keyframes, options) {
      const anim = { finished: Promise.resolve(), cancel: jest.fn(), keyframes, options, el: this };
      calls.push(anim);
      return anim;
    });
    window.matchMedia = jest.fn(() => ({ matches: reduced }));
    global.CSS = { supports: jest.fn(() => supportsLinear) };
    require("../../content/ui/motion.js");
    motion = global.OMNI_MOTION;
  });

  afterEach(() => {
    delete Element.prototype.animate;
    delete window.matchMedia;
    delete global.CSS;
  });

  test("exposes the default tokens", () => {
    expect(motion.TOKENS).toMatchObject({
      enterMs: 420,
      exitMs: 160,
      swapOutMs: 110,
      swapInMs: 300,
      morphMs: 380,
      staggerMs: 25,
      reducedInMs: 150,
      reducedOutMs: 120,
    });
  });

  test("enter uses the spring and scale 0.9 by default", () => {
    const el = document.createElement("div");
    motion.enter(el);
    const { keyframes, options } = calls[0];
    expect(keyframes[0].transform).toContain("scale(0.9)");
    expect(options.duration).toBe(420);
    expect(options.easing).toMatch(/^linear\(/);
  });

  test("enter honours opts.from", () => {
    motion.enter(document.createElement("div"), { from: 0.85 });
    expect(calls[0].keyframes[0].transform).toContain("scale(0.85)");
  });

  test("enter under reduced motion animates opacity only for 150ms", () => {
    reduced = true;
    motion.enter(document.createElement("div"));
    const { keyframes, options } = calls[0];
    expect(options.duration).toBe(150);
    keyframes.forEach((kf) => {
      expect(kf).not.toHaveProperty("transform");
      expect(kf).not.toHaveProperty("filter");
      expect(kf).toHaveProperty("opacity");
    });
  });

  test("exit resolves only after its animation finishes", async () => {
    const d = deferred();
    Element.prototype.animate = jest.fn(() => ({ finished: d.promise, cancel: jest.fn() }));
    let done = false;
    const p = motion.exit(document.createElement("div")).then(() => {
      done = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    d.resolve();
    await p;
    expect(done).toBe(true);
  });

  test("exit eases out to scale 0.96 in 160ms", async () => {
    await motion.exit(document.createElement("div"));
    const { keyframes, options } = calls[0];
    expect(keyframes[keyframes.length - 1]).toMatchObject({ opacity: 0 });
    expect(keyframes[keyframes.length - 1].transform).toContain("scale(0.96)");
    expect(options.duration).toBe(160);
    expect(options.easing).toBe("cubic-bezier(.22, 1, .36, 1)");
  });

  test("exit cancels a running enter first", async () => {
    const el = document.createElement("div");
    motion.enter(el);
    await motion.exit(el);
    expect(calls[0].cancel).toHaveBeenCalled();
  });

  test("exit resolves false when its animation is cancelled", async () => {
    Element.prototype.animate = jest.fn(() => ({
      finished: Promise.reject(new Error("AbortError")),
      cancel: jest.fn(),
    }));
    await expect(motion.exit(document.createElement("div"))).resolves.toBe(false);
  });

  test("a second enter on the same element cancels the first", () => {
    const el = document.createElement("div");
    motion.enter(el);
    motion.enter(el);
    expect(calls[0].cancel).toHaveBeenCalledTimes(1);
    expect(calls[1].cancel).not.toHaveBeenCalled();
  });

  test("falls back to cubic-bezier when linear() is unsupported", () => {
    supportsLinear = false;
    motion.enter(document.createElement("div"));
    expect(calls[0].options.easing).toBe("cubic-bezier(.22, 1, .36, 1)");
  });

  test("morph animates height from the old to the new size", async () => {
    const container = document.createElement("div");
    const inner = document.createElement("div");
    container.appendChild(inner);
    const heights = [100, 180];
    Object.defineProperty(container, "offsetHeight", { get: () => heights.shift() });
    const render = jest.fn();
    await motion.morph(container, inner, render);
    expect(render).toHaveBeenCalledTimes(1);
    const heightCall = calls.find((c) => c.el === container);
    expect(heightCall.keyframes.map((k) => k.height)).toEqual(["100px", "180px"]);
    expect(heightCall.options.duration).toBe(380);
    expect(calls.filter((c) => c.el === inner)).toHaveLength(2);
  });

  test("swap renders between a fade out and a fade in", async () => {
    const el = document.createElement("div");
    const render = jest.fn(() => {
      expect(calls).toHaveLength(1);
    });
    await motion.swap(el, render);
    expect(render).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].options.duration).toBe(110);
    expect(calls[1].options.duration).toBe(300);
  });

  test("stagger delays each element by 25ms", () => {
    const els = [
      document.createElement("i"),
      document.createElement("i"),
      document.createElement("i"),
    ];
    motion.stagger(els);
    expect(calls.map((c) => c.options.delay)).toEqual([0, 25, 50]);
  });

  test("revealWidth and collapseWidth animate width between 0 and scrollWidth", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { value: 44 });
    motion.revealWidth(el);
    motion.collapseWidth(el);
    expect(calls[0].keyframes.map((k) => k.width)).toEqual(["0px", "44px"]);
    expect(calls[1].keyframes.map((k) => k.width)).toEqual(["44px", "0px"]);
    expect(calls[0].cancel).toHaveBeenCalled();
  });

  test("revealWidth with a pin shifts the pin so the row's far edge stays put", () => {
    const el = document.createElement("div");
    const pin = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { value: 44 });
    motion.revealWidth(el, { pin });
    const pinCall = calls.find((c) => c.el === pin);
    expect(pinCall.keyframes.map((k) => k.translate)).toEqual(["44px 0px", "0px 0px"]);
    const widthCall = calls.find((c) => c.el === el);
    // Same timing, so the pin and the width move as one.
    expect(pinCall.options.duration).toBe(widthCall.options.duration);
    expect(pinCall.options.easing).toBe(widthCall.options.easing);

    motion.collapseWidth(el, { pin });
    const pinCalls = calls.filter((c) => c.el === pin);
    expect(pinCalls[1].keyframes.map((k) => k.translate)).toEqual(["0px 0px", "44px 0px"]);
    // Retargets: the earlier pin animation is cancelled.
    expect(pinCalls[0].cancel).toHaveBeenCalled();
  });

  test("revealWidth springs, collapseWidth eases out without overshoot", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { value: 44 });
    motion.revealWidth(el);
    motion.collapseWidth(el);
    expect(calls[0].options.easing).toMatch(/^linear\(/);
    // An overshoot past 0 would clamp the width while a pin kept moving.
    expect(calls[1].options.easing).toBe(motion.TOKENS.easeOut);
  });

  test("a pin animation never cancels another animation on the pin", () => {
    const el = document.createElement("div");
    const pin = document.createElement("div");
    Object.defineProperty(el, "scrollWidth", { value: 44 });
    motion.enter(pin);
    motion.revealWidth(el, { pin });
    expect(calls[0].cancel).not.toHaveBeenCalled();
  });

  test("reads overrides from --omni-motion-* custom properties", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.style.setProperty("--omni-motion-enter", "500ms");
    el.style.setProperty("--omni-motion-exit", "200ms");
    el.style.setProperty("--omni-motion-ease-out", "ease-out");
    const tokens = motion.readTokens(el);
    expect(tokens.enterMs).toBe(500);
    expect(tokens.exitMs).toBe(200);
    expect(tokens.easeOut).toBe("ease-out");
    expect(tokens.morphMs).toBe(380);
    el.remove();
  });

  describe("reduced motion", () => {
    beforeEach(() => {
      reduced = true;
    });

    test("revealWidth and collapseWidth never animate width", () => {
      const el = document.createElement("div");
      Object.defineProperty(el, "scrollWidth", { value: 44 });
      motion.revealWidth(el);
      motion.collapseWidth(el);
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((c) => {
        c.keyframes.forEach((kf) => {
          expect(kf).not.toHaveProperty("width");
          expect(kf).not.toHaveProperty("transform");
        });
      });
      expect(el.style.width).toBe("0px");
      motion.revealWidth(el);
      expect(el.style.width).toBe("");
    });

    test("revealWidth with a pin never translates the pin", () => {
      const el = document.createElement("div");
      const pin = document.createElement("div");
      Object.defineProperty(el, "scrollWidth", { value: 44 });
      motion.revealWidth(el, { pin });
      motion.collapseWidth(el, { pin });
      expect(calls.some((c) => c.el === pin)).toBe(false);
    });

    test("morph does not animate height", async () => {
      const container = document.createElement("div");
      const inner = document.createElement("div");
      const heights = [100, 180];
      Object.defineProperty(container, "offsetHeight", { get: () => heights.shift() });
      await motion.morph(container, inner, jest.fn());
      expect(calls.some((c) => c.el === container)).toBe(false);
      calls.forEach((c) => c.keyframes.forEach((kf) => expect(kf).not.toHaveProperty("height")));
    });

    test("stagger uses opacity only, without transform or delay", () => {
      motion.stagger([document.createElement("i"), document.createElement("i")]);
      calls.forEach((c) => {
        c.keyframes.forEach((kf) => expect(kf).not.toHaveProperty("transform"));
        expect(c.options.delay).toBe(0);
      });
    });
  });

  describe("supersession", () => {
    function cancellable() {
      Element.prototype.animate = jest.fn(function animate(keyframes, options) {
        let reject;
        const finished = new Promise((_, r) => {
          reject = r;
        });
        const anim = {
          finished,
          keyframes,
          options,
          el: this,
          cancel: jest.fn(() => reject(new Error("AbortError"))),
        };
        calls.push(anim);
        return anim;
      });
    }

    test("a superseded swap does not render", async () => {
      cancellable();
      const el = document.createElement("div");
      const render = jest.fn();
      const p = motion.swap(el, render);
      motion.enter(el);
      await p;
      expect(render).not.toHaveBeenCalled();
      expect(calls).toHaveLength(2);
    });

    test("a superseded morph does not render or fade in", async () => {
      cancellable();
      const container = document.createElement("div");
      const inner = document.createElement("div");
      const render = jest.fn();
      const p = motion.morph(container, inner, render);
      motion.enter(inner);
      await p;
      expect(render).not.toHaveBeenCalled();
      expect(calls).toHaveLength(2);
    });

    test("a render that returns false stops the morph before height and fade in", async () => {
      const container = document.createElement("div");
      const inner = document.createElement("div");
      await motion.morph(container, inner, () => false);
      // Only the fade out ran: no height animation, no fade in.
      expect(calls).toHaveLength(1);
    });

    test("a stopped morph cancels its fade out so inner is not left hidden", async () => {
      const container = document.createElement("div");
      const inner = document.createElement("div");
      await motion.morph(container, inner, () => false);
      expect(calls[0].cancel).toHaveBeenCalled();
    });

    test("exit resolves true when it completes", async () => {
      await expect(motion.exit(document.createElement("div"))).resolves.toBe(true);
    });

    test("exit resolves false when a newer enter cancels it", async () => {
      cancellable();
      const el = document.createElement("div");
      const p = motion.exit(el);
      motion.enter(el);
      await expect(p).resolves.toBe(false);
    });
  });

  test("refreshTokens re-reads tokens from the element into TOKENS in place", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.style.setProperty("--omni-motion-enter", "600ms");
    const ref = motion.TOKENS;
    motion.refreshTokens(host);
    expect(motion.TOKENS).toBe(ref);
    expect(ref.enterMs).toBe(600);
    host.remove();
  });
});
