/**
 * Omni AI: status notices for the plain document surfaces (settings, side
 * panel).
 *
 * Every success, warning, error and progress message goes through here, so
 * they share one shape (.ds-notice), one icon set and one colour family, and
 * a message is always set as text: provider errors are not ours to trust.
 */

/** The kinds of notice, each with its own .ds-notice--<kind> modifier. */
export const NOTICE_TYPES = ["success", "warning", "error", "processing"];

const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Static markup only: no message text ever enters these strings. */
const ICONS = {
  success: `<svg ${SVG_ATTRS}><path d="M20 6 9 17l-5-5"></path></svg>`,
  warning: `<svg ${SVG_ATTRS}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`,
  error: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>`,
  processing: `<svg ${SVG_ATTRS} class="ds-spin-icon"><path d="M21 12a9 9 0 1 1-6.22-8.56"></path></svg>`,
};

/**
 * Screen readers announce a live region's changes only if the region existed
 * before them, so two visually hidden regions are created as soon as this
 * module loads and every notice is spoken through them: errors assertively,
 * the rest politely. The visible notice is then not a live region itself,
 * which would read it twice.
 * @param {"polite"|"assertive"} politeness
 * @returns {HTMLElement|null}
 */
function announcer(politeness) {
  if (typeof document === "undefined" || !document.body) return null;
  let region = /** @type {HTMLElement|null} */ (
    document.querySelector(`[data-ds-announcer="${politeness}"]`)
  );
  if (!region) {
    region = document.createElement("div");
    region.dataset.dsAnnouncer = politeness;
    region.setAttribute("aria-live", politeness);
    region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
    region.setAttribute("aria-atomic", "true");
    region.style.cssText =
      "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;" +
      "overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    document.body.appendChild(region);
  }
  return region;
}

announcer("polite");
announcer("assertive");

/**
 * Speak a message through the matching live region. The region is emptied
 * first and filled on the next tick, so the same text twice is read twice.
 * @param {string} message
 * @param {boolean} urgent
 */
function announce(message, urgent) {
  const region = announcer(urgent ? "assertive" : "polite");
  if (!region) return;
  region.textContent = "";
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/**
 * Show a notice in an element, or hide it when the message is empty.
 * The element keeps its own classes (save-status, status-line, ...); only the
 * kind modifier and the visibility classes change.
 * @param {HTMLElement|null|undefined} el
 * @param {"success"|"warning"|"error"|"processing"} type
 * @param {string} message
 */
export function renderNotice(el, type, message) {
  if (!el) return;

  el.classList.remove(...NOTICE_TYPES.map((kind) => `ds-notice--${kind}`));
  el.classList.add("ds-notice");

  if (!message) {
    el.textContent = "";
    el.classList.add("hidden");
    el.classList.remove("visible");
    return;
  }

  const kind = NOTICE_TYPES.includes(type) ? type : "processing";
  el.classList.add(`ds-notice--${kind}`, "visible");
  el.classList.remove("hidden");
  el.removeAttribute("role");
  announce(message, kind === "error");

  const icon = new DOMParser().parseFromString(ICONS[kind], "image/svg+xml").documentElement;
  const text = document.createElement("span");
  text.className = "ds-notice-text";
  text.textContent = message;
  el.replaceChildren(document.importNode(icon, true), text);
}
