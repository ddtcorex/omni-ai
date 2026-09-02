describe("editor adapter registry", () => {
  let registry;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = "";
    global.self = global;
    require("../../content/editor-adapters.js");
    registry = global.OMNI_EDITOR_ADAPTERS;
  });

  test("routes textarea to the standard adapter", () => {
    expect(registry.resolveAdapter(document.createElement("textarea")).id).toBe("standard");
  });

  test("routes a descendant of a contenteditable host to the rich-text adapter", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editor.appendChild(child);
    document.body.appendChild(editor);

    expect(registry.resolveAdapter(child).id).toBe("richText");
    expect(registry.getEditableHost(child)).toBe(editor);
  });

  test("falls back to static text for a plain paragraph", () => {
    expect(registry.resolveAdapter(document.createElement("p")).id).toBe("static");
  });

  test("replaces the captured rich-text selection", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);

    const range = document.createRange();
    range.setStart(editor.firstChild, 6);
    range.setEnd(editor.firstChild, 11);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const result = await registry.replaceViaAdapters(editor, { lastRange: range }, "Omni");

    expect(result).toEqual(expect.objectContaining({ ok: true, adapter: "richText" }));
    expect(editor.textContent).toBe("Hello Omni");
  });

  test("replaces the full rich-text draft when no selection is captured", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Draft to improve";
    document.body.appendChild(editor);

    const result = await registry.replaceViaAdapters(editor, { fullText: true }, "Improved draft");

    expect(result).toEqual(expect.objectContaining({ ok: true, adapter: "richText" }));
    expect(editor.textContent).toBe("Improved draft");
  });

  test("finds an editable host through an open shadow root", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const shadow = editor.attachShadow({ mode: "open" });
    const child = document.createElement("span");
    shadow.appendChild(child);
    document.body.appendChild(editor);

    expect(registry.getEditableHost(child)).toBe(editor);
  });

  test("loads the adapter before content.js in every about:blank editor frame", () => {
    const manifest = require("../../manifest.json");
    const contentScript = manifest.content_scripts[0];

    expect(contentScript.js).toEqual(["content/editor-adapters.js", "content/positioning.js", "content/content.js"]);
    expect(contentScript.all_frames).toBe(true);
    expect(contentScript.match_about_blank).toBe(true);
  });

  test.each(["discord.com", "web.telegram.org", "app.slack.com", "teams.microsoft.com"])(
    "declares %s as a rich-text composer host",
    (hostname) => {
      expect(registry.getSiteHint(hostname)).toEqual({ adapterId: "richText" });
    },
  );
});
