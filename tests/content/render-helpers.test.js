describe("render helpers", () => {
  let render;

  beforeEach(() => {
    jest.resetModules();
    global.self = global;
    delete global.OMNI_RENDER;
    require("../../content/ui/render-helpers.js");
    render = global.OMNI_RENDER;
  });

  test("escapeHtml neutralizes markup", () => {
    const out = render.escapeHtml("<img src=x onerror=alert(1)>");
    expect(out).not.toContain("<img");
    expect(out).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("escapeHtml escapes quotes and ampersands and tolerates non strings", () => {
    expect(render.escapeHtml(`a & "b" 'c'`)).toBe("a &amp; &quot;b&quot; &#39;c&#39;");
    expect(render.escapeHtml(null)).toBe("");
    expect(render.escapeHtml(undefined)).toBe("");
    expect(render.escapeHtml(42)).toBe("42");
  });

  test("diffHtml escapes both sides", () => {
    const out = render.diffHtml("hello <b>old</b>", "hello <i>new</i>");
    expect(out).not.toMatch(/<b>|<i>/);
    expect(out).toContain("&lt;b&gt;old&lt;/b&gt;");
    expect(out).toContain("&lt;i&gt;new&lt;/i&gt;");
    // The only tags in the output are the diff spans themselves.
    const tags = out.match(/<\/?[a-z]+[^>]*>/g) || [];
    tags.forEach((tag) => expect(tag).toMatch(/^<(\/span|span class="omni-ai-diff-(del|ins)")>$/));
  });

  test("diffHtml marks removed and added words", () => {
    const out = render.diffHtml("the quick brown fox", "the slow brown fox jumps");
    expect(out).toBe(
      'the <span class="omni-ai-diff-del">quick</span> <span class="omni-ai-diff-ins">slow</span> brown fox <span class="omni-ai-diff-ins">jumps</span>',
    );
  });

  test("diffHtml groups a run of changed words into one span", () => {
    const out = render.diffHtml("a b c d", "a x y d");
    expect(out).toBe(
      'a <span class="omni-ai-diff-del">b c</span> <span class="omni-ai-diff-ins">x y</span> d',
    );
  });

  test("diffHtml keeps the new text's line breaks", () => {
    const out = render.diffHtml("one two\nthree", "one two\nthree four");
    expect(out).toBe('one two\nthree <span class="omni-ai-diff-ins">four</span>');
  });

  test("diffHtml of identical text has no marks", () => {
    expect(render.diffHtml("same text", "same text")).toBe("same text");
  });

  test("diffHtml with an empty side marks the other side whole", () => {
    expect(render.diffHtml("", "new words")).toBe(
      '<span class="omni-ai-diff-ins">new words</span>',
    );
    expect(render.diffHtml("old", "")).toBe('<span class="omni-ai-diff-del">old</span>');
  });

  test("diffHtml falls back to a whole replacement for very long texts", () => {
    const a = Array.from({ length: 700 }, (_, i) => `a${i}`).join(" ");
    const b = Array.from({ length: 700 }, (_, i) => `b${i}`).join(" ");
    const out = render.diffHtml(a, b);
    expect(out.match(/omni-ai-diff-del/g)).toHaveLength(1);
    expect(out.match(/omni-ai-diff-ins/g)).toHaveLength(1);
  });
});
