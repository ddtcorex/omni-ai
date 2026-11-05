import { renderNotice, NOTICE_TYPES } from "../../lib/notice.js";

describe("renderNotice", () => {
  let el;

  beforeEach(() => {
    // Add the notice beside what the page already holds, as a real page does,
    // instead of replacing the body and the live regions the module created.
    document.getElementById("n")?.remove();
    el = document.createElement("div");
    el.id = "n";
    el.className = "save-status ds-notice hidden";
    document.body.appendChild(el);
  });

  test.each(NOTICE_TYPES)("a %s notice carries its modifier, an icon and the text", (type) => {
    renderNotice(el, type, "Hello");

    expect(el.classList.contains("ds-notice")).toBe(true);
    expect(el.classList.contains(`ds-notice--${type}`)).toBe(true);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.querySelector("svg")).not.toBeNull();
    expect(el.textContent).toBe("Hello");
  });

  test("switching kind drops the previous modifier and keeps the element's own classes", () => {
    renderNotice(el, "error", "Bad");
    renderNotice(el, "success", "Good");

    expect(el.classList.contains("ds-notice--error")).toBe(false);
    expect(el.classList.contains("ds-notice--success")).toBe(true);
    expect(el.classList.contains("save-status")).toBe(true);
  });

  test("text from a provider is rendered as text, never as markup", () => {
    renderNotice(el, "error", '<img src=x onerror="alert(1)">');

    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  test("the page has both live regions before any notice is shown", () => {
    const polite = document.querySelector('[data-ds-announcer="polite"]');
    const assertive = document.querySelector('[data-ds-announcer="assertive"]');
    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(polite.getAttribute("role")).toBe("status");
    expect(assertive.getAttribute("aria-live")).toBe("assertive");
    expect(assertive.getAttribute("role")).toBe("alert");
  });

  test("an error is spoken assertively, the rest politely, through the live regions", () => {
    jest.useFakeTimers();
    try {
      renderNotice(el, "error", "Bad");
      jest.runAllTimers();
      expect(document.querySelector('[data-ds-announcer="assertive"]').textContent).toBe("Bad");

      renderNotice(el, "success", "Saved");
      jest.runAllTimers();
      expect(document.querySelector('[data-ds-announcer="polite"]').textContent).toBe("Saved");
      // The visible notice is not a second live region, so nothing is read twice.
      expect(el.hasAttribute("role")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("the processing icon spins", () => {
    renderNotice(el, "processing", "Working");
    expect(el.querySelector("svg").classList.contains("ds-spin-icon")).toBe(true);
  });

  test("an empty message hides the notice", () => {
    renderNotice(el, "success", "Good");
    renderNotice(el, "success", "");
    expect(el.classList.contains("hidden")).toBe(true);
    expect(el.textContent).toBe("");
  });
});
