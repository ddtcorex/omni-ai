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

  // A native insertText that turns lines into paragraphs: what Chrome does
  // in a contenteditable (and TinyMCE in its iframe body).
  function nativeParagraphInsert(editor) {
    document.execCommand = jest.fn((command, _ui, text) => {
      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();
      const fragment = document.createDocumentFragment();
      text.split("\n").forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        fragment.appendChild(p);
      });
      range.insertNode(fragment);
      return true;
    });
    return () => {
      delete document.execCommand;
      editor.remove();
    };
  }

  function selectWord(editor, start, end) {
    const range = document.createRange();
    range.setStart(editor.firstChild, start);
    range.setEnd(editor.firstChild, end);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    return range;
  }

  test("a native edit that turns a multi-line result into paragraphs counts as replaced, once", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);
    const cleanup = nativeParagraphInsert(editor);
    try {
      const range = selectWord(editor, 6, 11);
      const result = await registry.replaceViaAdapters(
        editor,
        { lastRange: range },
        "Line one.\nLine two.",
      );
      expect(result).toEqual(expect.objectContaining({ ok: true, adapter: "richText" }));
      expect(editor.querySelectorAll("p")).toHaveLength(2);
      expect(editor.textContent).toBe("Hello Line one.Line two.");
    } finally {
      cleanup();
    }
  });

  test("a native edit with a result equal to the selection is not inserted again", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);
    const cleanup = nativeParagraphInsert(editor);
    try {
      const range = selectWord(editor, 6, 11);
      const result = await registry.replaceViaAdapters(editor, { lastRange: range }, "world");
      expect(result.ok).toBe(true);
      expect(editor.textContent).toBe("Hello world");
    } finally {
      cleanup();
    }
  });

  test("the DOM fallback writes a multi-line result as lines with <br> between", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);

    const range = selectWord(editor, 6, 11);
    const result = await registry.replaceViaAdapters(
      editor,
      { lastRange: range },
      "Line one.\nLine two.",
    );

    expect(result.ok).toBe(true);
    expect(editor.innerHTML).toBe("Hello Line one.<br>Line two.");
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

    expect(contentScript.js).toEqual([
      "content/editor-adapters.js",
      "content/positioning.js",
      "content/ui/motion.js",
      "content/ui/surface.js",
      "content/ui/render-helpers.js",
      "content/content.js",
    ]);
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
