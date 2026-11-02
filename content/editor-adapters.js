/**
 * Omni AI editor adapters.
 *
 * This is a classic script because Manifest V3 content scripts are not ES
 * modules. It is loaded before content/content.js and exposed on `self`.
 */
(function registerEditorAdapters(root) {
  "use strict";

  function editableValue(element) {
    return (element?.innerText || element?.textContent || "").trim();
  }

  function isEditable(element) {
    return !!(
      element &&
      element.nodeType === 1 &&
      (element.isContentEditable || element.getAttribute?.("contenteditable") === "true")
    );
  }

  function getEditableHost(element) {
    let node = element;
    while (node) {
      if (isEditable(node)) return node;

      const nodeRoot = node.getRootNode?.();
      if (nodeRoot?.host) {
        node = nodeRoot.host;
      } else {
        node = node.parentElement;
      }
    }
    return null;
  }

  function selectionFor(element) {
    return element?.ownerDocument?.defaultView?.getSelection?.() || null;
  }

  function rangeBelongsTo(host, range) {
    return !!(host && range && host.contains(range.commonAncestorContainer));
  }

  function restoreRange(host, savedRange, fullText) {
    const documentRef = host.ownerDocument;
    const selection = selectionFor(host);
    let range = savedRange && savedRange.cloneRange?.();

    if (!rangeBelongsTo(host, range)) {
      range = documentRef.createRange();
      range.selectNodeContents(host);
    }
    if (fullText) range.selectNodeContents(host);

    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
  }

  function dispatchInput(host) {
    const EventConstructor = host.ownerDocument.defaultView?.Event || Event;
    host.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  }

  const standard = {
    id: "standard",
    isApplicable(element) {
      const tagName = element?.tagName;
      if (tagName === "TEXTAREA") return true;
      if (tagName !== "INPUT") return false;
      return ["text", "email", "number", "search", "tel", "url"].includes(
        (element.type || "text").toLowerCase(),
      );
    },
    getText(element) {
      const selected = element.value.substring(element.selectionStart, element.selectionEnd);
      if (!selected && element.value.trim()) {
        return { text: element.value.trim(), isSelection: false, fullText: true };
      }
      return { text: selected, isSelection: !!selected, fullText: false };
    },
    getRect(element) {
      return element.getBoundingClientRect();
    },
    beginReplace(_element, state) {
      return state || {};
    },
    applyReplace(element, state, newText) {
      const start = element.selectionStart;
      const end = element.selectionEnd;
      element.value = state?.fullText
        ? newText
        : element.value.substring(0, start) + newText + element.value.substring(end);
      dispatchInput(element);
      return true;
    },
  };

  const richText = {
    id: "richText",
    isApplicable(element) {
      return !!getEditableHost(element);
    },
    getText(element) {
      const host = getEditableHost(element);
      const selected = selectionFor(host)?.toString() || "";
      if (selected) return { text: selected, isSelection: true, fullText: false };
      return { text: editableValue(host), isSelection: false, fullText: true };
    },
    getRect(element) {
      const host = getEditableHost(element);
      const range = selectionFor(host)?.rangeCount ? selectionFor(host).getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect?.();
      return rect?.width || rect?.height ? rect : host.getBoundingClientRect();
    },
    beginReplace(element, state) {
      return {
        ...state,
        lastRange: state?.lastRange?.cloneRange?.() || null,
      };
    },
    applyReplace(element, state, newText) {
      const host = getEditableHost(element);
      if (!host) return false;

      host.focus();
      const range = restoreRange(host, state?.lastRange, state?.fullText);

      // Whether the native edit touched the editor at all. Its text alone
      // cannot tell: a result equal to the selection leaves it unchanged.
      const View = host.ownerDocument.defaultView;
      const ObserverConstructor = View?.MutationObserver || root.MutationObserver;
      const observer = ObserverConstructor
        ? new ObserverConstructor(() => {})
        : { observe() {}, takeRecords: () => [], disconnect() {} };
      observer.observe(host, { childList: true, characterData: true, subtree: true });
      try {
        host.ownerDocument.execCommand?.("insertText", false, newText);
      } catch {
        // Use the DOM Range fallback below when the browser rejects execCommand.
      }
      const nativeEdited = observer.takeRecords().length > 0;
      observer.disconnect();

      // A native edit already wrote the text: never insert it a second time.
      // Lines become paragraphs or <br>s and runs of spaces become
      // non-breaking spaces, so compare without whitespace.
      if (nativeEdited) return landed(host, newText, state?.fullText);

      // The fallback must change the editor too: text it already held never
      // reads as a successful replace.
      observer.observe(host, { childList: true, characterData: true, subtree: true });
      range.deleteContents();
      const fragment = textFragment(host.ownerDocument, newText);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      const caret = host.ownerDocument.createRange();
      if (last) caret.setStartAfter(last);
      caret.collapse(true);
      const selection = selectionFor(host);
      selection?.removeAllRanges();
      selection?.addRange(caret);
      const fallbackEdited = observer.takeRecords().length > 0;
      observer.disconnect();
      dispatchInput(host);

      return fallbackEdited && landed(host, newText, state?.fullText);
    },
  };

  // Text without its whitespace (newlines, tabs, non-breaking spaces): how
  // an editor lays lines and spaces out is not part of what was written.
  function squash(text) {
    return String(text).replace(/\s+/g, "");
  }

  // The editor shows `newText`: as its whole value for a full-text replace,
  // anywhere in it otherwise.
  function landed(host, newText, fullText) {
    const value = squash(editableValue(host));
    const wanted = squash(newText);
    return fullText ? value === wanted : value.includes(wanted);
  }

  // `text` as nodes for an editor: one text node per line, <br> between.
  function textFragment(documentRef, text) {
    const fragment = documentRef.createDocumentFragment();
    String(text)
      .split("\n")
      .forEach((line, i) => {
        if (i > 0) fragment.appendChild(documentRef.createElement("br"));
        if (line) fragment.appendChild(documentRef.createTextNode(line));
      });
    return fragment;
  }

  const staticText = {
    id: "static",
    isApplicable() {
      return true;
    },
    getText(element) {
      const selected = selectionFor(element)?.toString() || "";
      return { text: selected.trim(), isSelection: !!selected, fullText: false };
    },
    getRect(element) {
      const selection = selectionFor(element);
      return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    },
  };

  const ADAPTERS = [standard, richText, staticText];

  const SITE_HINTS = ["discord.com", "web.telegram.org", "app.slack.com", "teams.microsoft.com"];

  function getSiteHint(hostname) {
    const normalized = (hostname || "").toLowerCase();
    return SITE_HINTS.some((host) => normalized === host || normalized.endsWith("." + host))
      ? { adapterId: "richText" }
      : null;
  }

  function resolveAdapter(element, options = {}) {
    const hint = getSiteHint(options.hostname);
    const preferred = hint && ADAPTERS.find((adapter) => adapter.id === hint.adapterId);
    if (preferred?.isApplicable(element)) return preferred;
    return ADAPTERS.find((adapter) => adapter.isApplicable(element)) || staticText;
  }

  async function replaceViaAdapters(element, state, newText) {
    const adapter = resolveAdapter(element);
    if (!adapter.applyReplace) return { ok: false, attempts: [adapter.id + ":readonly"] };

    try {
      const replaceState = adapter.beginReplace?.(element, state) || state || {};
      const ok = await adapter.applyReplace(element, replaceState, newText);
      return ok
        ? { ok: true, adapter: adapter.id, attempts: [] }
        : { ok: false, attempts: [adapter.id] };
    } catch (error) {
      return { ok: false, attempts: [adapter.id + ":" + error.message] };
    }
  }

  const api = { ADAPTERS, getEditableHost, getSiteHint, resolveAdapter, replaceViaAdapters };
  root.OMNI_EDITOR_ADAPTERS = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
