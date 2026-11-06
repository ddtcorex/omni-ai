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

  test("an edit that changed nothing in the editor is not a success", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);
    const range = selectWord(editor, 6, 11);
    const insertNode = Range.prototype.insertNode;
    const deleteContents = Range.prototype.deleteContents;
    Range.prototype.insertNode = () => {};
    Range.prototype.deleteContents = () => {};
    try {
      const result = await registry.replaceViaAdapters(editor, { lastRange: range }, "world");
      expect(result.ok).toBe(false);
    } finally {
      Range.prototype.insertNode = insertNode;
      Range.prototype.deleteContents = deleteContents;
    }
  });

  // A selection replace never widens to the whole editor: with no saved
  // range it writes over the live selection, and with neither it fails.
  test("a selection replace with no saved range writes over the live selection", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);
    selectWord(editor, 6, 11);
    const result = await registry.replaceViaAdapters(editor, { lastRange: null }, "Omni");
    expect(result.ok).toBe(true);
    expect(editor.textContent).toBe("Hello Omni");
  });

  test("a selection replace with no saved range and no selection fails and changes nothing", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "Hello world";
    document.body.appendChild(editor);
    window.getSelection().removeAllRanges();
    const result = await registry.replaceViaAdapters(editor, { lastRange: null }, "Omni");
    expect(result.ok).toBe(false);
    expect(editor.textContent).toBe("Hello world");
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

describe("a caret in a document editor stands for its block", () => {
  let registry;
  let richText;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = "";
    global.self = global;
    require("../../content/editor-adapters.js");
    registry = global.OMNI_EDITOR_ADAPTERS;
    richText = registry.ADAPTERS.find((adapter) => adapter.id === "richText");
  });

  function editor(html) {
    const host = document.createElement("div");
    host.setAttribute("contenteditable", "true");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  function caretIn(node, offset = 1) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  test("a caret in one paragraph of several reads that paragraph, not the document", () => {
    const host = editor("<h2>Title</h2><p>First <b>bold</b> one.</p><p>Second one here.</p>");
    caretIn(host.querySelectorAll("p")[1].firstChild, 3);

    expect(richText.getText(host)).toEqual({
      text: "Second one here.",
      isSelection: false,
      fullText: false,
      scope: "block",
    });
  });

  test("selectScope selects that block, so the action runs on a selection", () => {
    const host = editor("<p>First one.</p><ul><li><p>An item here.</p></li></ul>");
    caretIn(host.querySelector("li p").firstChild, 2);

    expect(richText.selectScope(host)).toBe(true);
    expect(window.getSelection().toString()).toBe("An item here.");
    expect(richText.getText(host)).toEqual({
      text: "An item here.",
      isSelection: true,
      fullText: false,
    });
  });

  test("an editor with a single block keeps the whole field", () => {
    const host = editor("<p>Only one paragraph.</p>");
    caretIn(host.querySelector("p").firstChild, 2);

    expect(richText.getText(host)).toMatchObject({ text: "Only one paragraph.", fullText: true });
    expect(richText.selectScope(host)).toBe(false);
  });

  test("lines as plain divs count as blocks too", () => {
    const host = editor("<div>Dear team,</div><div>Please review this.</div>");
    caretIn(host.children[1].firstChild, 4);

    expect(richText.getText(host).text).toBe("Please review this.");
  });

  test("a caret on an empty line reads nothing, so no toolbar shows", () => {
    const host = editor("<p>First one.</p><p><br></p>");
    caretIn(host.querySelectorAll("p")[1], 0);

    expect(richText.getText(host).text).toBe("");
    expect(richText.selectScope(host)).toBe(false);
  });

  test("a selection is never narrowed or widened", () => {
    const host = editor("<p>First one.</p><p>Second one.</p>");
    const range = document.createRange();
    range.setStart(host.querySelector("p").firstChild, 0);
    range.setEnd(host.querySelector("p").firstChild, 5);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    expect(richText.getText(host)).toMatchObject({ text: "First", isSelection: true });
    expect(richText.selectScope(host)).toBe(false);
  });

  test.each(["app.slack.com", "discord.com"])(
    "a chat composer on %s keeps the whole message",
    (hostname) => {
      const host = editor("<p>Line one.</p><p>Line two.</p>");
      caretIn(host.querySelectorAll("p")[1].firstChild, 2);

      expect(richText.getText(host, { hostname })).toMatchObject({ fullText: true });
      expect(richText.selectScope(host, { hostname })).toBe(false);
    },
  );
});
