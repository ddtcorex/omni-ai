/**
 * Omni AI motion helpers.
 *
 * Classic script (Manifest V3 content scripts are not ES modules), loaded
 * before content/content.js and exposed on `self` as OMNI_MOTION. Every helper
 * is built on the Web Animations API and retargets: it cancels any animation
 * this module started on the same element before starting a new one.
 */
(function registerMotion(root) {
  "use strict";

  const DEFAULTS = {
    enterMs: 420,
    exitMs: 160,
    swapOutMs: 110,
    swapInMs: 300,
    morphMs: 380,
    staggerMs: 25,
    reducedInMs: 150,
    reducedOutMs: 120,
    spring: "linear(0, .25 7%, .62 15%, .9 24%, 1.03 33%, 1.04 41%, 1.01 55%, 1)",
    easeOut: "cubic-bezier(.22, 1, .36, 1)",
  };

  // CSS custom property -> TOKENS key. Only these four are overridable.
  const CSS_VARS = {
    "--omni-motion-enter": "enterMs",
    "--omni-motion-exit": "exitMs",
    "--omni-motion-spring": "spring",
    "--omni-motion-ease-out": "easeOut",
  };

  const MS_KEYS = new Set(["enterMs", "exitMs"]);

  /**
   * Resolve the tokens for an element: computed --omni-motion-* values when
   * present, otherwise the defaults.
   * @param {Element} [el]
   * @returns {typeof DEFAULTS}
   */
  function readTokens(el) {
    const tokens = { ...DEFAULTS };
    let style = null;
    try {
      const target = el || (typeof document !== "undefined" ? document.documentElement : null);
      if (target && typeof getComputedStyle === "function") style = getComputedStyle(target);
    } catch {
      style = null;
    }
    if (!style) return tokens;
    Object.keys(CSS_VARS).forEach((name) => {
      const raw = style.getPropertyValue(name).trim();
      if (!raw) return;
      const key = CSS_VARS[name];
      if (MS_KEYS.has(key)) {
        const ms = parseFloat(raw);
        const isSeconds = /[\d.]s$/.test(raw);
        if (Number.isFinite(ms)) tokens[key] = isSeconds ? ms * 1000 : ms;
      } else {
        tokens[key] = raw;
      }
    });
    return tokens;
  }

  const TOKENS = readTokens();

  const running = new WeakMap();

  function prefersReducedMotion() {
    try {
      return (
        typeof root.matchMedia === "function" &&
        root.matchMedia("(prefers-reduced-motion: reduce)").matches === true
      );
    } catch {
      return false;
    }
  }

  function supportsLinear() {
    try {
      return (
        typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)")
      );
    } catch {
      return false;
    }
  }

  function springEasing() {
    return supportsLinear() ? TOKENS.spring : DEFAULTS.easeOut;
  }

  /** Cancel what this module started on `el`, start `keyframes`, track it. */
  function play(el, keyframes, options) {
    const prev = running.get(el);
    if (prev) prev.cancel();
    const anim = el.animate(keyframes, options);
    running.set(el, anim);
    return anim;
  }

  /**
   * Resolve true when `anim` finished and is still the current animation on
   * `el`; false when it was cancelled or superseded by a newer one.
   */
  function completed(el, anim) {
    return Promise.resolve(anim.finished).then(
      () => running.get(el) === anim,
      () => false,
    );
  }

  /**
   * Spring in from a small scale, offset and blur. Reduced motion: opacity.
   * @param {Element} el
   * @param {{from?: number}} [opts]
   * @returns {Animation}
   */
  function enter(el, opts) {
    if (prefersReducedMotion()) {
      return play(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: TOKENS.reducedInMs,
        easing: TOKENS.easeOut,
        fill: "backwards",
      });
    }
    const from = opts && typeof opts.from === "number" ? opts.from : 0.9;
    return play(
      el,
      [
        { opacity: 0, transform: `translateY(-4px) scale(${from})`, filter: "blur(3px)" },
        { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      ],
      { duration: TOKENS.enterMs, easing: springEasing(), fill: "backwards" },
    );
  }

  /**
   * Ease out to scale 0.96 and opacity 0. Resolves once the animation ends:
   * true when it completed (safe to remove the element), false when a newer
   * animation on the same element superseded it.
   * @param {Element} el
   * @returns {Promise<boolean>}
   */
  function exit(el) {
    const reduced = prefersReducedMotion();
    const anim = play(
      el,
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.96)" },
          ],
      {
        duration: reduced ? TOKENS.reducedOutMs : TOKENS.exitMs,
        easing: TOKENS.easeOut,
        fill: "forwards",
      },
    );
    return completed(el, anim);
  }

  function fade(el, from, to, duration) {
    const anim = play(el, [{ opacity: from }, { opacity: to }], {
      duration,
      easing: TOKENS.easeOut,
      fill: "both",
    });
    return completed(el, anim);
  }

  /**
   * The height `el` shows right now, then stop every size animation on it
   * (a morph or a height follow still in flight, with or without a width),
   * so the next measurement reads the real size of what is rendered. Other
   * animations (the card's enter, a fade) keep running.
   * @param {HTMLElement} el
   * @returns {number}
   */
  function settleHeight(el) {
    const shown = el.offsetHeight;
    // Its content must be measured at the width it really has now.
    unpinWidth(el);
    const anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
    anims.forEach((anim) => {
      const effect = /** @type {KeyframeEffect | null} */ (anim.effect);
      const frames =
        effect && typeof effect.getKeyframes === "function" ? effect.getKeyframes() : [];
      if (frames.some((frame) => "height" in frame || "width" in frame)) {
        anim.cancel();
        if (running.get(el) === anim) running.delete(el);
      }
    });
    return shown;
  }

  // Scrollers a height animation clipped, per animated element: the list of
  // { el, prev } of the animation that owns them, so a newer one (or the end
  // of the owner) restores each inline overflow-y exactly once.
  const clips = new WeakMap();

  function releaseClips(el, owner) {
    const list = clips.get(el);
    if (!list || (owner && list !== owner)) return;
    list.forEach(({ el: node, prev }) => {
      node.style.overflowY = prev;
    });
    clips.delete(el);
  }

  /**
   * Clip `el` and its descendants that scroll but whose content fits at the
   * current (final) layout. While the height animates they would overflow on
   * the frames where `el` is shorter than its end height (the spring
   * undershoots, or it grows from a smaller state), flashing a scrollbar that
   * takes width and rewraps the text. Scrollers whose content does not fit
   * keep their scrollbar from the first frame, so their width never changes.
   * @param {HTMLElement} el
   */
  // Call after render() and before the height animation starts: "fits" is
  // judged on the final layout, which only exists at that moment.
  function clipFittingScrollers(el) {
    releaseClips(el);
    const list = [];
    [el, ...el.querySelectorAll("*")].forEach((node) => {
      const target = /** @type {HTMLElement} */ (node);
      const overflowY = getComputedStyle(target).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") return;
      if (target.scrollHeight > target.clientHeight + 1) return;
      list.push({ el: target, prev: target.style.overflowY });
      target.style.overflowY = "hidden";
    });
    clips.set(el, list);
    return list;
  }

  // Keyframes for a size change: height always, width only when it changes.
  function sizeFrames(fromHeight, toHeight, fromWidth, toWidth) {
    const widthChanges = Boolean(fromWidth && toWidth && fromWidth !== toWidth);
    return [
      { height: `${fromHeight}px`, ...(widthChanges ? { width: `${fromWidth}px` } : {}) },
      { height: `${toHeight}px`, ...(widthChanges ? { width: `${toWidth}px` } : {}) },
    ];
  }

  // The content pinned while a size animation of its container runs, per
  // container: { pin, prev }. One at a time, released synchronously when the
  // animation is stopped (settleHeight) or replaced, never by a late tick.
  const widthPins = new WeakMap();

  function unpinWidth(container) {
    const entry = widthPins.get(container);
    if (!entry) return;
    entry.pin.style.width = entry.prev;
    widthPins.delete(container);
  }

  // Hold `pin` (the card's content) at its current, final width while
  // `container`'s width animates, so its text wraps once instead of on every
  // frame. Returns the release, a no-op once a newer pin took over.
  function pinWidth(container, pin) {
    unpinWidth(container);
    if (!pin) return () => {};
    const entry = { pin, prev: pin.style.width };
    widthPins.set(container, entry);
    pin.style.width = `${pin.offsetWidth}px`;
    return () => {
      if (widthPins.get(container) === entry) unpinWidth(container);
    };
  }

  /**
   * Size follow for an in-place change (not a state change, which morph
   * animates): `el` springs from `from` to `to` in height, and from
   * `opts.fromWidth` to `opts.toWidth` in width when those differ, with
   * `opts.pin` held at its final width meanwhile. Played directly, not
   * through the per-element slot, so it never cancels the card's enter or
   * exit.
   * @param {HTMLElement} el
   * @param {number} from
   * @param {number} to
   * @param {{fromWidth?: number, toWidth?: number, pin?: HTMLElement}} [opts]
   */
  function followHeight(el, from, to, opts = {}) {
    const { fromWidth, toWidth, pin } = opts;
    const widthChanges = Boolean(fromWidth && toWidth && fromWidth !== toWidth);
    if ((from === to && !widthChanges) || !from || prefersReducedMotion()) return null;
    const clipped = clipFittingScrollers(el);
    const unpin = widthChanges ? pinWidth(el, pin) : () => {};
    const anim = el.animate(sizeFrames(from, to, fromWidth, toWidth), {
      duration: TOKENS.morphMs,
      easing: springEasing(),
    });
    const release = () => {
      releaseClips(el, clipped);
      unpin();
    };
    Promise.resolve(anim.finished).then(release, release);
    return anim;
  }

  /**
   * Fade `inner` out, run `render`, animate `container` height (and width,
   * when the render changed it) from its old to its new measured size, fade
   * `inner` back in. `inner` is held at its final width while the width
   * animates. A morph superseded by a
   * newer animation on `inner` stops without calling `render`; a `render`
   * returning false stops it right after.
   * @param {HTMLElement} container
   * @param {HTMLElement} inner
   * @param {() => (void | false)} render
   * @returns {Promise<void>}
   */
  async function morph(container, inner, render) {
    const reduced = prefersReducedMotion();
    const outMs = reduced ? TOKENS.reducedOutMs : TOKENS.swapOutMs;
    const inMs = reduced ? TOKENS.reducedInMs : TOKENS.swapInMs;
    if (!(await fade(inner, 1, 0, outMs))) return;
    // Read after the fade: a previous morph may still be changing the height
    // (a fast or cached result), and placement in `render` must measure the
    // new content at its real height, not at that animation's frame.
    const oldHeight = settleHeight(container);
    const oldWidth = container.offsetWidth;
    // `render` returns false when the transition was superseded (a close, a
    // newer state) while the fade ran: stop, so the height morph never takes
    // over the container's running animation (a closing card's exit).
    if (render() === false) {
      // The fade out holds `inner` at opacity 0 (fill both): release it so a
      // card that stays (close then quick reopen) is not left invisible.
      const stale = running.get(inner);
      if (stale) stale.cancel();
      running.delete(inner);
      return;
    }
    const newHeight = container.offsetHeight;
    const newWidth = container.offsetWidth;
    const widthChanges = Boolean(oldWidth && newWidth && oldWidth !== newWidth);
    const tasks = [];
    if (!reduced && (oldHeight !== newHeight || widthChanges)) {
      const clipped = clipFittingScrollers(container);
      const unpin = widthChanges ? pinWidth(container, inner) : () => {};
      const release = (result) => {
        releaseClips(container, clipped);
        unpin();
        return result;
      };
      tasks.push(
        completed(
          container,
          play(container, sizeFrames(oldHeight, newHeight, oldWidth, newWidth), {
            duration: TOKENS.morphMs,
            easing: springEasing(),
          }),
        ).then(release, release),
      );
    }
    tasks.push(fade(inner, 0, 1, inMs));
    await Promise.all(tasks);
  }

  /**
   * Small blur swap (Copy -> Copied): fade out, render, fade in. A swap
   * superseded by a newer animation on `el` stops without rendering.
   * @param {HTMLElement} el
   * @param {() => void} render
   * @returns {Promise<void>}
   */
  async function swap(el, render) {
    const reduced = prefersReducedMotion();
    const blur = (px) => (reduced ? {} : { filter: `blur(${px}px)` });
    const out = play(
      el,
      [
        { opacity: 1, ...blur(0) },
        { opacity: 0, ...blur(3) },
      ],
      {
        duration: reduced ? TOKENS.reducedOutMs : TOKENS.swapOutMs,
        easing: TOKENS.easeOut,
        fill: "both",
      },
    );
    if (!(await completed(el, out))) return;
    render();
    play(
      el,
      [
        { opacity: 0, ...blur(3) },
        { opacity: 1, ...blur(0) },
      ],
      {
        duration: reduced ? TOKENS.reducedInMs : TOKENS.swapInMs,
        easing: TOKENS.easeOut,
        fill: "both",
      },
    );
    await completed(el, running.get(el));
  }

  /**
   * Fade and lift each element in, staggered by TOKENS.staggerMs.
   * @param {Element[]} els
   */
  function stagger(els) {
    const reduced = prefersReducedMotion();
    Array.from(els).forEach((el, i) => {
      play(
        el,
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(4px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
        {
          duration: reduced ? TOKENS.reducedInMs : TOKENS.swapInMs,
          delay: reduced ? 0 : i * TOKENS.staggerMs,
          easing: TOKENS.easeOut,
          fill: "backwards",
        },
      );
    });
  }

  // Pin animations are tracked apart from `running`, so moving a pin never
  // cancels its own enter or exit animation.
  const pinned = new WeakMap();

  /**
   * Translate `pin` in step with a width change of `from` -> `to`, so the
   * far edge of a row that grows towards the pin's start stays where it is
   * (a toolbar pill whose actions reveal to the left of its fixed button).
   * The caller moves the pin's `left` by the full width up front.
   */
  function shiftPin(pin, from, to, options) {
    const prev = pinned.get(pin);
    if (prev) prev.cancel();
    const full = Math.max(from, to);
    const anim = pin.animate(
      [{ translate: `${full - from}px 0px` }, { translate: `${full - to}px 0px` }],
      options,
    );
    pinned.set(pin, anim);
    return anim;
  }

  function animateWidth(el, from, to, opts) {
    if (prefersReducedMotion()) {
      // Reduced motion is opacity only: set the end state, fade instead.
      el.style.width = to === 0 ? "0px" : "";
      return play(
        el,
        to === 0 ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: to === 0 ? TOKENS.reducedOutMs : TOKENS.reducedInMs,
          easing: TOKENS.easeOut,
          fill: "both",
        },
      );
    }
    // Collapsing eases out like every exit: a spring overshoot past 0 would
    // clamp the width while a pin kept moving.
    const easing = to === 0 ? TOKENS.easeOut : springEasing();
    const options = { duration: TOKENS.morphMs, easing, fill: "both" };
    if (opts && opts.pin) shiftPin(opts.pin, from, to, options);
    return play(el, [{ width: `${from}px` }, { width: `${to}px` }], options);
  }

  /**
   * Animate width from 0 to the natural width. `opts.pin` (optional) is
   * translated in step, see shiftPin.
   * @param {HTMLElement} el
   * @param {{pin?: HTMLElement}} [opts]
   */
  function revealWidth(el, opts) {
    return animateWidth(el, 0, el.scrollWidth, opts);
  }

  /**
   * Animate width from the natural width to 0.
   * @param {HTMLElement} el
   * @param {{pin?: HTMLElement}} [opts]
   */
  function collapseWidth(el, opts) {
    return animateWidth(el, el.scrollWidth, 0, opts);
  }

  /** Cancel the pin animation revealWidth/collapseWidth started on `pin`. */
  function releasePin(pin) {
    const anim = pinned.get(pin);
    if (anim) anim.cancel();
    pinned.delete(pin);
  }

  /**
   * Re-read the --omni-motion-* tokens from `el` (for example the shadow
   * host, where the custom properties live) into TOKENS, in place.
   * @param {Element} el
   */
  function refreshTokens(el) {
    Object.assign(TOKENS, readTokens(el));
  }

  root.OMNI_MOTION = {
    TOKENS,
    readTokens,
    refreshTokens,
    settleHeight,
    followHeight,
    prefersReducedMotion,
    enter,
    exit,
    morph,
    swap,
    stagger,
    revealWidth,
    collapseWidth,
    releasePin,
  };
})(typeof self !== "undefined" ? self : this);
