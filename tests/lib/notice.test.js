import { renderNotice, NOTICE_TYPES } from "../../lib/notice.js";

describe("renderNotice", () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = `<div id="n" class="save-status ds-notice hidden"></div>`;
    el = document.getElementById("n");
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

  test("an error is announced as an alert, the rest as a status", () => {
    renderNotice(el, "error", "Bad");
    expect(el.getAttribute("role")).toBe("alert");
    renderNotice(el, "processing", "Working");
    expect(el.getAttribute("role")).toBe("status");
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
