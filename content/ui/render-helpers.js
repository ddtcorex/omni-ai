/**
 * Omni AI render helpers.
 *
 * Classic script (Manifest V3 content scripts are not ES modules), loaded
 * after content/ui/surface.js and before content/content.js, exposed on
 * `self` as OMNI_RENDER. AI output, page selections and provider error
 * messages are untrusted text: every piece of it reaches the overlay through
 * escapeHtml (or textContent), never as markup.
 */
(function registerRender(root) {
  "use strict";

  const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /**
   * @param {unknown} text
   * @returns {string} the text with every HTML special character escaped
   */
  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
  }

  // Above this many word pairs the LCS table gets too large for a UI thread;
  // the diff then shows the whole text as replaced.
  const MAX_CELLS = 250000;

  /** Words of `text` with the whitespace that follows each one. */
  function tokenize(text) {
    const str = String(text || "");
    const lead = (str.match(/^\s*/) || [""])[0];
    const words = [];
    const gaps = [];
    const re = /(\S+)(\s*)/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      words.push(m[1]);
      gaps.push(m[2]);
    }
    return { lead, words, gaps };
  }

  /**
   * Word ops turning `a` into `b`: [type, index] with type "eq" | "del" |
   * "ins"; "eq" and "ins" index into `b`, "del" into `a`. Within a changed
   * block deletions come before insertions.
   */
  function wordOps(a, b) {
    const n = a.length;
    const m = b.length;
    if (n * m > MAX_CELLS) {
      return [...a.map((_, i) => ["del", i]), ...b.map((_, j) => ["ins", j])];
    }
    // lcs[i][j]: LCS length of a[i..] and b[j..].
    const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    let dels = [];
    let inss = [];
    const flush = () => {
      ops.push(...dels, ...inss);
      dels = [];
      inss = [];
    };
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        flush();
        ops.push(["eq", j]);
        i++;
        j++;
      } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
        dels.push(["del", i]);
        i++;
      } else {
        inss.push(["ins", j]);
        j++;
      }
    }
    flush();
    return ops;
  }

  function span(type, text) {
    return `<span class="omni-ai-diff-${type}">${text}</span>`;
  }

  /**
   * Inline word diff from `original` to `next`: removed words in
   * `.omni-ai-diff-del`, added words in `.omni-ai-diff-ins`, a run of changed
   * words grouped into one span. Both sides are escaped. The whitespace,
   * including line breaks, is the new text's.
   * @param {string} original
   * @param {string} next
   * @returns {string}
   */
  function diffHtml(original, next) {
    const a = tokenize(original);
    const b = tokenize(next);
    const ops = wordOps(a.words, b.words);
    let html = escapeHtml(b.lead);
    let k = 0;
    while (k < ops.length) {
      const [type] = ops[k];
      if (type === "eq") {
        const j = ops[k][1];
        html += escapeHtml(b.words[j]) + escapeHtml(b.gaps[j]);
        k++;
        continue;
      }
      // A run of the same op type becomes one span.
      const run = [];
      while (k < ops.length && ops[k][0] === type) run.push(ops[k++][1]);
      if (type === "del") {
        html += span("del", escapeHtml(run.map((i) => a.words[i]).join(" "))) + " ";
      } else {
        const inner = run
          .map((j, x) => escapeHtml(b.words[j]) + (x < run.length - 1 ? escapeHtml(b.gaps[j]) : ""))
          .join("");
        html += span("ins", inner) + escapeHtml(b.gaps[run[run.length - 1]]);
      }
    }
    return html.replace(/\s+$/, "");
  }

  root.OMNI_RENDER = { escapeHtml, diffHtml };
})(typeof self !== "undefined" ? self : this);
