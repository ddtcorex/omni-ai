/**
 * Omni AI overlay surface.
 *
 * Classic script (Manifest V3 content scripts are not ES modules), loaded
 * after content/ui/motion.js and before content/content.js, exposed on `self`
 * as OMNI_SURFACE. It owns one morphing card (`div.omni-ai-overlay` holding a
 * single `div.omni-ai-surface-inner`) and the state machine that swaps the
 * card's content between menu, pageCard, ask, loading, result and error.
 */
(function registerSurface(root) {
  "use strict";

  /**
   * @param {{
   *   mount: () => ParentNode,
   *   renderers: Record<string, (inner: HTMLElement, data: object, surface: object) => void>,
   *   place: (card: HTMLElement) => void,
   *   backFallback?: () => void,
   *   onClose?: () => void,
   * }} options
   */
  function create(options) {
    const { mount, renderers, place, backFallback, onClose } = options;
    const motion = () => root.OMNI_MOTION;

    let card = null;
    let inner = null;
    let current = null; // { state, data } currently shown
    let history = []; // previous non-loading { state, data } entries
    let token = 0;
    let closing = null; // Promise while a close animation runs

    function renderInto(state, data) {
      const render = renderers[state];
      // Renderers start from an empty inner, never from the previous state.
      inner.replaceChildren();
      if (typeof render === "function") render(inner, data, surface);
      place(card);
    }

    // Listens on the frame's document in the capture phase while a card is
    // open: focus often stays in the editor (the toolbar never takes it) or
    // nowhere (a keyboard command), and Escape must close the card anyway.
    // With no card the listener is gone, so the page keeps its Escape.
    function onKeydown(event) {
      if (event.key !== "Escape" || event.isComposing) return;
      if (!card || closing) return;
      event.stopPropagation();
      surface.close();
    }

    function buildCard() {
      card = document.createElement("div");
      card.className = "omni-ai-overlay";
      inner = document.createElement("div");
      inner.className = "omni-ai-surface-inner";
      card.appendChild(inner);
      document.addEventListener("keydown", onKeydown, true);
      mount().appendChild(card);
    }

    // Opening is a fresh entry point (the toolbar, a keyboard command): on a
    // card that is already open it morphs in place and starts a new history,
    // so no stale entry (one a backFallback left behind) comes back on Back.
    async function open(state, data = {}) {
      if (card && !closing) {
        history = [];
        return to(state, data, { replace: true });
      }
      token += 1;
      history = [];
      // A close animation is running: enter() below supersedes it, so the
      // close backs off and the same card is reused.
      closing = null;
      if (!card) buildCard();
      // A morph stopped by the close may have left a fade on inner.
      else if (typeof inner.getAnimations === "function") {
        inner.getAnimations().forEach((anim) => anim.cancel());
      }
      current = { state, data };
      renderInto(state, data);
      motion().enter(card);
    }

    /**
     * Move to a state. `replace` swaps the current state out without keeping
     * it for Back (a retry or a tone re-run replaces its result).
     * @param {string} state
     * @param {object} [data]
     * @param {{replace?: boolean}} [opts]
     */
    async function to(state, data = {}, opts = {}) {
      if (!card || closing) return open(state, data);
      token += 1;
      if (!opts.replace && current && current.state !== "loading") history.push(current);
      current = { state, data };
      await motion().morph(card, inner, () => {
        // A close or a newer transition replaced this one while it faded out.
        if (closing || !current || current.state !== state || current.data !== data) return false;
        renderInto(state, data);
      });
    }

    async function back() {
      // No card, or it is fading out: a late Back click must not revive it.
      if (!card || closing) return;
      token += 1;
      if (history.length === 0) {
        if (typeof backFallback === "function") backFallback();
        else await close();
        return;
      }
      const previous = history.pop();
      current = previous;
      await motion().morph(card, inner, () => {
        if (closing || current !== previous) return false;
        renderInto(previous.state, previous.data);
      });
    }

    function close() {
      if (closing) return closing;
      if (!card) return Promise.resolve();
      token += 1;
      const el = card;
      const run = (async () => {
        let completed = await motion().exit(el);
        // Something else animated the card meanwhile: a close still wins, so
        // exit again (a reopen clears `closing` and ends the loop).
        for (let i = 0; i < 3 && closing === run && !completed; i += 1) {
          completed = await motion().exit(el);
        }
        // Superseded by a reopen (exit false, or a stale true): keep the card.
        if (closing !== run) return;
        // Still cancelled after the retries: a close wins, remove regardless.
        document.removeEventListener("keydown", onKeydown, true);
        el.remove();
        card = null;
        inner = null;
        current = null;
        history = [];
        closing = null;
        if (typeof onClose === "function") onClose();
      })();
      closing = run;
      return run;
    }

    const surface = {
      open,
      to,
      back,
      close,
      isOpen: () => Boolean(card) && !closing,
      state: () => (current ? current.state : null),
      card: () => card,
      beginRequest: () => token,
      isCurrent: (value) => value === token,
    };
    return surface;
  }

  root.OMNI_SURFACE = { create };
})(typeof self !== "undefined" ? self : this);
