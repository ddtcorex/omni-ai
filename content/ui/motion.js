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
   * Fade `inner` out, run `render`, animate `container` height from its old
   * to its new measured height, fade `inner` back in. A morph superseded by a
   * newer animation on `inner` stops without calling `render`.
   * @param {HTMLElement} container
   * @param {HTMLElement} inner
   * @param {() => void} render
   * @returns {Promise<void>}
   */
  async function morph(container, inner, render) {
    const reduced = prefersReducedMotion();
    const outMs = reduced ? TOKENS.reducedOutMs : TOKENS.swapOutMs;
    const inMs = reduced ? TOKENS.reducedInMs : TOKENS.swapInMs;
    const oldHeight = container.offsetHeight;
    if (!(await fade(inner, 1, 0, outMs))) return;
    render();
    const newHeight = container.offsetHeight;
    const tasks = [];
    if (!reduced && oldHeight !== newHeight) {
      tasks.push(
        completed(
          container,
          play(container, [{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], {
            duration: TOKENS.morphMs,
            easing: springEasing(),
          }),
        ),
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

  function animateWidth(el, from, to) {
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
    return play(el, [{ width: `${from}px` }, { width: `${to}px` }], {
      duration: TOKENS.morphMs,
      easing: springEasing(),
      fill: "both",
    });
  }

  /** Animate width from 0 to the natural width. */
  function revealWidth(el) {
    return animateWidth(el, 0, el.scrollWidth);
  }

  /** Animate width from the natural width to 0. */
  function collapseWidth(el) {
    return animateWidth(el, el.scrollWidth, 0);
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
    prefersReducedMotion,
    enter,
    exit,
    morph,
    swap,
    stagger,
    revealWidth,
    collapseWidth,
  };
})(typeof self !== "undefined" ? self : this);
