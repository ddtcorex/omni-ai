/** @jest-environment jsdom */
describe("overlay surface", () => {
  let surface;
  let mount;
  let renderers;
  let place;
  let onClose;
  let backFallback;
  let exitResolvers;
  let manualExit;

  function make(extra = {}) {
    return global.OMNI_SURFACE.create({
      mount: () => mount,
      renderers,
      place,
      onClose,
      ...extra,
    });
  }

  beforeEach(() => {
    jest.resetModules();
    global.self = global;
    document.body.innerHTML = "";
    mount = document.createElement("div");
    document.body.appendChild(mount);
    exitResolvers = [];
    manualExit = false;
    global.OMNI_MOTION = {
      enter: jest.fn(() => ({})),
      exit: jest.fn(() =>
        manualExit ? new Promise((resolve) => exitResolvers.push(resolve)) : Promise.resolve(true),
      ),
      morph: jest.fn(async (container, inner, render) => render()),
    };
    renderers = {};
    ["menu", "pageCard", "ask", "loading", "result", "error"].forEach((name) => {
      renderers[name] = jest.fn((inner) => {
        inner.textContent = name;
      });
    });
    place = jest.fn();
    onClose = jest.fn();
    backFallback = jest.fn();
    require("../../content/ui/surface.js");
    surface = make({ backFallback });
  });

  test("open renders the state into a single .omni-ai-overlay and calls place", async () => {
    await surface.open("menu", { a: 1 });
    const cards = mount.querySelectorAll(".omni-ai-overlay");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelectorAll(".omni-ai-surface-inner")).toHaveLength(1);
    expect(cards[0].textContent).toBe("menu");
    expect(renderers.menu).toHaveBeenCalledWith(
      cards[0].querySelector(".omni-ai-surface-inner"),
      { a: 1 },
      surface,
    );
    expect(place).toHaveBeenCalledWith(cards[0]);
    expect(global.OMNI_MOTION.enter).toHaveBeenCalledWith(cards[0]);
    expect(surface.isOpen()).toBe(true);
    expect(surface.state()).toBe("menu");
    expect(surface.card()).toBe(cards[0]);
  });

  test("to swaps content in the same card element", async () => {
    await surface.open("menu");
    const before = surface.card();
    await surface.to("result", { text: "x" });
    expect(surface.card()).toBe(before);
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(1);
    expect(before.textContent).toBe("result");
    expect(surface.state()).toBe("result");
    expect(place).toHaveBeenCalledTimes(2);
  });

  test("back returns to the previous non-loading state", async () => {
    await surface.open("menu", { m: 1 });
    await surface.to("loading");
    await surface.to("result");
    await surface.back();
    expect(surface.state()).toBe("menu");
    expect(surface.card().textContent).toBe("menu");
    expect(renderers.menu).toHaveBeenLastCalledWith(expect.anything(), { m: 1 }, surface);
  });

  test("to with replace does not push the current state onto the history", async () => {
    await surface.open("menu", { m: 1 });
    await surface.to("loading");
    await surface.to("result", { r: 1 });
    // A retry or tone re-run replaces the result: Back skips the old one.
    await surface.to("loading", {}, { replace: true });
    await surface.to("result", { r: 2 });
    await surface.back();
    expect(surface.state()).toBe("menu");
    expect(backFallback).not.toHaveBeenCalled();
  });

  test("to with replace still takes a fresh request token", async () => {
    await surface.open("menu");
    await surface.to("result");
    const t1 = surface.beginRequest();
    await surface.to("loading", {}, { replace: true });
    expect(surface.isCurrent(t1)).toBe(false);
  });

  test("open on an open card starts a fresh history", async () => {
    await surface.open("menu", { m: 1 });
    await surface.to("result");
    // Re-entering the menu through the toolbar: no stale entry survives.
    await surface.open("menu", { m: 2 });
    const t1 = surface.beginRequest();
    await surface.back();
    expect(backFallback).toHaveBeenCalledTimes(1);
    expect(surface.isCurrent(t1)).toBe(false);
    expect(renderers.menu).toHaveBeenLastCalledWith(expect.anything(), { m: 2 }, surface);
  });

  test("back with an empty history uses backFallback", async () => {
    await surface.open("menu");
    await surface.back();
    expect(backFallback).toHaveBeenCalledTimes(1);
    expect(surface.isOpen()).toBe(true);
  });

  test("back with an empty history and no fallback closes", async () => {
    const s = make();
    await s.open("menu");
    await s.back();
    expect(s.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("close removes the card only after the exit animation resolves", async () => {
    manualExit = true;
    await surface.open("menu");
    const closing = surface.close();
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(1);
    exitResolvers[0](true);
    await closing;
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(0);
    expect(surface.isOpen()).toBe(false);
    expect(surface.state()).toBeNull();
    expect(surface.card()).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("close twice is a no-op the second time", async () => {
    await surface.open("menu");
    await surface.close();
    await surface.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(global.OMNI_MOTION.exit).toHaveBeenCalledTimes(1);
  });

  test("a token taken before close is no longer current after it", async () => {
    await surface.open("menu");
    const t1 = surface.beginRequest();
    expect(surface.isCurrent(t1)).toBe(true);
    await surface.close();
    expect(surface.isCurrent(t1)).toBe(false);
  });

  test("a token taken before to or back is no longer current after it", async () => {
    await surface.open("menu");
    const t1 = surface.beginRequest();
    await surface.to("result");
    expect(surface.isCurrent(t1)).toBe(false);
    const t2 = surface.beginRequest();
    await surface.back();
    expect(surface.isCurrent(t2)).toBe(false);
  });

  test("opening while a close animation runs keeps exactly one card in the root", async () => {
    manualExit = true;
    await surface.open("menu");
    const closing = surface.close();
    const reopened = surface.open("ask");
    // The real motion.exit resolves false when enter supersedes it.
    exitResolvers[0](false);
    await Promise.all([closing, reopened]);
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(1);
    expect(surface.isOpen()).toBe(true);
    expect(surface.state()).toBe("ask");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("a stale exit that still reports true does not remove a reopened card", async () => {
    manualExit = true;
    await surface.open("menu");
    const closing = surface.close();
    const reopened = surface.open("ask");
    exitResolvers[0](true);
    await Promise.all([closing, reopened]);
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(1);
    expect(surface.isOpen()).toBe(true);
  });

  test("back during a close animation does nothing", async () => {
    manualExit = true;
    await surface.open("menu", { m: 1 });
    await surface.to("result");
    const closing = surface.close();
    const morphCalls = global.OMNI_MOTION.morph.mock.calls.length;
    await surface.back();
    expect(global.OMNI_MOTION.morph.mock.calls.length).toBe(morphCalls);
    expect(backFallback).not.toHaveBeenCalled();
    expect(surface.card().textContent).toBe("result");
    exitResolvers[0](true);
    await closing;
    expect(surface.card()).toBeNull();
  });

  test("back with no card does nothing", async () => {
    await surface.back();
    expect(backFallback).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("renderers always receive an empty inner", async () => {
    const seen = [];
    renderers.result = jest.fn((inner) => {
      seen.push(inner.childNodes.length);
      inner.appendChild(document.createElement("span"));
    });
    renderers.menu = jest.fn((inner) => {
      seen.push(inner.childNodes.length);
      inner.appendChild(document.createElement("b"));
    });
    await surface.open("menu");
    await surface.to("result");
    await surface.back();
    expect(seen).toEqual([0, 0, 0]);
    expect(surface.card().querySelector(".omni-ai-surface-inner").childNodes).toHaveLength(1);
  });

  test("a close wins over a morph that is still fading out", async () => {
    manualExit = true;
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    global.OMNI_MOTION.morph = jest.fn(async (container, inner, render) => {
      await gate;
      if (render() === false) return;
    });
    await surface.open("menu");
    renderers.result.mockClear();
    const morphing = surface.to("result", { text: "x" });
    const closing = surface.close();
    release();
    await morphing;
    // The superseded morph must not render into, or re-show, the closing card.
    expect(renderers.result).not.toHaveBeenCalled();
    exitResolvers[0](true);
    await closing;
    expect(surface.card()).toBeNull();
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a close that keeps being cancelled still removes the card", async () => {
    global.OMNI_MOTION.exit = jest.fn(() => Promise.resolve(false));
    await surface.open("menu");
    await surface.close();
    expect(surface.card()).toBeNull();
    expect(mount.querySelectorAll(".omni-ai-overlay")).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Later transitions work again.
    await surface.open("menu");
    expect(surface.isOpen()).toBe(true);
  });

  test("reopening a card mid close drops animations a stale morph left on inner", async () => {
    manualExit = true;
    const cancel = jest.fn();
    const proto = HTMLElement.prototype;
    proto.getAnimations = () => [{ cancel }];
    try {
      await surface.open("menu");
      const closing = surface.close();
      const reopened = surface.open("ask");
      exitResolvers[0](false);
      await Promise.all([closing, reopened]);
      expect(cancel).toHaveBeenCalled();
    } finally {
      delete proto.getAnimations;
    }
  });

  test("Escape inside the card closes it", async () => {
    await surface.open("menu");
    surface.card().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(surface.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape closes the open card while focus stays outside it", async () => {
    const editor = document.createElement("textarea");
    document.body.appendChild(editor);
    editor.focus();
    await surface.open("menu");
    const pageHandler = jest.fn();
    editor.addEventListener("keydown", pageHandler);
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(surface.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The Escape closed the card, so the page does not also act on it.
    expect(pageHandler).not.toHaveBeenCalled();
  });

  test("Escape reaches the page untouched when no card is open", async () => {
    await surface.open("menu");
    await surface.close();
    const pageHandler = jest.fn();
    document.body.addEventListener("keydown", pageHandler);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape during IME composition does not close the card", async () => {
    await surface.open("menu");
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(surface.isOpen()).toBe(true);
  });
});
