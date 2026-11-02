const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Result-type cards size to their text (spec follow-up B): short text keeps
// the 320px card, long text widens it up to min(560px, viewport - 32px), and
// the body scrolls inside the room the placement leaves, under a fixed
// header and action row. The editor menu always stays 320px.

const LONG = Array.from(
  { length: 14 },
  (_, i) =>
    `Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog while the team reviews the release notes and the open follow-ups.`,
).join("\n");
const SHORT = "A short answer.";

const FIXTURE = `<!doctype html><html><body style="margin:0">
  <textarea id="target" rows="3" cols="40" style="position:absolute;top:40px;left:40px">Hello world, this is a test.</textarea>
  <textarea id="low" rows="3" cols="40" style="position:fixed;bottom:10px;left:40px">Hello world, this is a test.</textarea>
  <p id="page" style="position:absolute;top:200px;left:40px;margin:0">Some plain page text to translate.</p>
</body></html>`;

const EDITOR_DOC = `<!doctype html><html><body contenteditable="true" style="margin:0;padding:20px">
<p>Alpha beta gamma delta epsilon.</p><p>Second paragraph stays.</p>
</body></html>`;

const IFRAME_FIXTURE = `<!doctype html><html><body style="margin:20px">
<iframe id="editor" style="width:600px;height:600px" srcdoc="${EDITOR_DOC.replace(/"/g, "&quot;")}"></iframe>
</body></html>`;

async function seedConfig(sw) {
  await sw.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: [] },
    });
  });
}

function stubGemini(context, reply, status = 200) {
  return context.route("**/generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body:
        status === 200
          ? JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] })
          : JSON.stringify({ error: { message: reply } }),
    }),
  );
}

async function clickShadow(target, selector) {
  await target.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
  const handle = await target.evaluateHandle(
    (q) => document.getElementById("omni-ai-shadow-host").shadowRoot.querySelector(q),
    selector,
  );
  await handle.asElement().click();
}

async function waitShadow(target, selector) {
  await target.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
}

// The card once its morph settled: its rect, the body's scroll amount, and
// whether anything but the body scrolls.
function cardMetrics(target, bodySelector = ".omni-ai-content-area") {
  return target.evaluate((bodySel) => {
    const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
    const card = root.querySelector(".omni-ai-overlay");
    const inner = root.querySelector(".omni-ai-surface-inner");
    const body = root.querySelector(bodySel);
    const r = card.getBoundingClientRect();
    return {
      width: r.width,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      placement: card.dataset.placement,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      scroll: body.scrollHeight - body.clientHeight,
      innerScroll: inner.scrollHeight - inner.clientHeight,
    };
  }, bodySelector);
}

// What the body would scroll in the layout before this change: a 320px card
// whose body was capped at 60vh. Measured on the live card, then restored.
function oldLayoutScroll(target, bodySelector = ".omni-ai-content-area", cap = "60vh") {
  return target.evaluate(
    ({ bodySel, cap }) => {
      const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
      const card = root.querySelector(".omni-ai-overlay");
      const body = root.querySelector(bodySel);
      const width = card.style.width;
      const maxHeight = body.style.maxHeight;
      card.style.width = "320px";
      body.style.maxHeight = cap;
      const scroll = body.scrollHeight - body.clientHeight;
      card.style.width = width;
      body.style.maxHeight = maxHeight;
      return scroll;
    },
    { bodySel: bodySelector, cap },
  );
}

async function openEditorResult(page, port, fieldId, reply, mouse) {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate((id) => {
    const el = /** @type {HTMLTextAreaElement} */ (document.getElementById(id));
    el.focus();
    el.setSelectionRange(6, 11);
  }, fieldId);
  await page.locator(`#${fieldId}`).dispatchEvent("mouseup", mouse);
  await clickShadow(page, ".omni-ai-quick-btn");
  await waitShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
  await page.waitForTimeout(500);
  const menu = await cardMetrics(page, ".omni-ai-menu-grid");
  await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
  await page.waitForFunction(
    (t) =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-result-text")
        ?.textContent.includes(t),
    reply.slice(-20),
    { timeout: 8000 },
  );
  await page.waitForTimeout(800); // the size morph settles
  return menu;
}

function expectInside(m) {
  expect(m.left).toBeGreaterThanOrEqual(0);
  expect(m.top).toBeGreaterThanOrEqual(0);
  expect(m.right).toBeLessThanOrEqual(m.viewportWidth);
  expect(m.bottom).toBeLessThanOrEqual(m.viewportHeight);
}

async function withPage(fixture, reply, body, { status, reducedMotion } = {}) {
  const { server, port } = await serveFixtureHtml(fixture);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, reply, status);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
    await body(page, port, sw);
  } finally {
    await context.close();
    server.close();
  }
}

test("a long result widens the card and scrolls at least 50% less than the 320px layout", async () => {
  await withPage(FIXTURE, LONG, async (page, port) => {
    const menu = await openEditorResult(page, port, "target", LONG);
    expect(menu.width).toBe(320);
    const m = await cardMetrics(page);
    const old = await oldLayoutScroll(page);
    expect(m.width).toBeGreaterThan(320);
    expect(m.width).toBeLessThanOrEqual(560);
    expect(old).toBeGreaterThan(0);
    expect(m.scroll).toBeLessThanOrEqual(old * 0.5);
    // Only the body scrolls: header and actions stay put.
    expect(m.innerScroll).toBeLessThanOrEqual(1);
    expectInside(m);
    await page.screenshot({ path: test.info().outputPath("long-after.png") });
  });
});

test("a short result keeps the 320px card", async () => {
  await withPage(FIXTURE, SHORT, async (page, port) => {
    await openEditorResult(page, port, "target", SHORT);
    const m = await cardMetrics(page);
    expect(m.width).toBe(320);
    expectInside(m);
  });
});

test("Back from a wide result returns to a 320px menu", async () => {
  await withPage(FIXTURE, LONG, async (page, port) => {
    await openEditorResult(page, port, "target", LONG);
    expect((await cardMetrics(page)).width).toBeGreaterThan(320);
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, ".omni-ai-menu-grid");
    await page.waitForTimeout(800);
    expect((await cardMetrics(page, ".omni-ai-menu-grid")).width).toBe(320);
  });
});

test("a long result above the selection widens, stays above it and inside the viewport", async () => {
  await withPage(FIXTURE, LONG, async (page, port) => {
    await openEditorResult(page, port, "low", LONG, { clientX: 300, clientY: 860 });
    const m = await cardMetrics(page);
    expect(m.placement).toBe("above");
    expect(m.width).toBeGreaterThan(320);
    const fieldTop = await page.evaluate(
      () => document.getElementById("low").getBoundingClientRect().top,
    );
    expect(m.bottom).toBeLessThanOrEqual(fieldTop);
    expect(m.innerScroll).toBeLessThanOrEqual(1);
    expectInside(m);
  });
});

test("a long provider error widens the card", async () => {
  const message = `Provider error: ${"the upstream service rejected the request because the quota for this key is exhausted. ".repeat(14)}`;
  await withPage(
    FIXTURE,
    message,
    async (page, port) => {
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.evaluate(() => {
        const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
        el.focus();
        el.setSelectionRange(6, 11);
      });
      await page.locator("#target").dispatchEvent("mouseup");
      await clickShadow(page, ".omni-ai-quick-btn");
      await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
      await waitShadow(page, ".omni-ai-error-text");
      await page.waitForTimeout(800);
      const m = await cardMetrics(page);
      expect(m.width).toBeGreaterThan(320);
      expectInside(m);
    },
    { status: 400 },
  );
});

test("a long page translation widens the card and uses the free height", async () => {
  await withPage(FIXTURE, LONG, async (page, port) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const box = await page.locator("#page").boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await clickShadow(page, ".omni-ai-quick-btn");
    await waitShadow(page, ".omni-ai-suggestion-content");
    await page.waitForTimeout(900);
    const m = await cardMetrics(page, ".omni-ai-suggestion-content");
    const old = await oldLayoutScroll(page, ".omni-ai-suggestion-content", "180px");
    expect(m.width).toBeGreaterThan(320);
    expect(m.scroll).toBeLessThanOrEqual(old * 0.5);
    expect(m.innerScroll).toBeLessThanOrEqual(1);
    expectInside(m);
  });
});

test("in an iframe editor a long result widens within the frame", async () => {
  await withPage(IFRAME_FIXTURE, LONG, async (page, port) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const frameEl = await page.waitForSelector("#editor");
    const frame = await frameEl.contentFrame();
    await frame.waitForSelector("p");
    const word = await frame.evaluate(() => {
      const text = document.querySelector("p").firstChild;
      const range = document.createRange();
      range.setStart(text, 6);
      range.setEnd(text, 10);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const box = await frameEl.boundingBox();
    await page.mouse.move(box.x + word.x + 1, box.y + word.y + word.h / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + word.x + word.w - 1, box.y + word.y + word.h / 2, { steps: 6 });
    await page.mouse.up();
    await clickShadow(frame, ".omni-ai-quick-btn");
    await waitShadow(frame, ".omni-ai-menu-grid");
    await page.waitForTimeout(500);
    expect((await cardMetrics(frame, ".omni-ai-menu-grid")).width).toBe(320);
    await clickShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitShadow(frame, ".omni-ai-result-text");
    await page.waitForTimeout(800);
    const m = await cardMetrics(frame);
    expect(m.width).toBeGreaterThan(320);
    expect(m.width).toBeLessThanOrEqual(m.viewportWidth - 32);
    expect(m.innerScroll).toBeLessThanOrEqual(1);
    expectInside(m);
  });
});

// The width springs with the height while the text keeps its final wrap,
// and the page never scrolls or grows a scrollbar meanwhile.
test("the width animates with the height without moving the page", async () => {
  await withPage(FIXTURE, LONG, async (page, port) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await page.locator("#target").dispatchEvent("mouseup");
    await clickShadow(page, ".omni-ai-quick-btn");
    await waitShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForTimeout(500);
    // Sample every frame from the click until the morph settled.
    await page.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__samples = [];
      const tick = () => {
        const root = document.getElementById("omni-ai-shadow-host")?.shadowRoot;
        const card = root?.querySelector(".omni-ai-overlay");
        const text = root?.querySelector(".omni-ai-result-text");
        w.__samples.push({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          docScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          sizeAnims: card
            ? card
                .getAnimations()
                .filter((a) =>
                  /** @type {KeyframeEffect} */ (a.effect).getKeyframes().some((k) => "width" in k),
                ).length
            : 0,
          textWidth: text ? text.getBoundingClientRect().width : null,
        });
        if (w.__samples.length < 120) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForTimeout(2200);
    const samples = await page.evaluate(() => /** @type {any} */ (window).__samples);
    expect(samples.some((s) => s.sizeAnims > 0)).toBe(true);
    for (const s of samples) {
      expect(s.scrollX).toBe(0);
      expect(s.scrollY).toBe(0);
      expect(s.docScrollWidth).toBeLessThanOrEqual(s.clientWidth);
    }
    // The result text has one width from its first frame on.
    const widths = [...new Set(samples.map((s) => s.textWidth).filter((w) => w !== null))];
    expect(widths).toHaveLength(1);
  });
});

test("under reduced motion the width snaps", async () => {
  await withPage(
    FIXTURE,
    LONG,
    async (page, port) => {
      await openEditorResult(page, port, "target", LONG);
      const m = await cardMetrics(page);
      expect(m.width).toBeGreaterThan(320);
      const sizeAnims = await page.evaluate(() =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-overlay")
          .getAnimations()
          .filter((a) =>
            /** @type {KeyframeEffect} */ (a.effect).getKeyframes().some((k) => "width" in k),
          ),
      );
      expect(sizeAnims).toHaveLength(0);
    },
    { reducedMotion: true },
  );
});

// The page card widens when its translation lands; a reading action picked
// while that size follow still runs must not leave the content pinned at a
// stale width (clipped text, Close cut off).
test("a cached reading action right after a wide translation lands ends at the card's own width", async () => {
  await withPage(FIXTURE, LONG, async (page, port, sw) => {
    // Translations are long (the card widens), the summary is short: its
    // card must come back to 320px, which a stale pin would break.
    await page.context().unroute("**/generativelanguage.googleapis.com/**");
    await page.context().route("**/generativelanguage.googleapis.com/**", (route) => {
      const prompt = route.request().postData() || "";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: /summar/i.test(prompt) ? SHORT : LONG }] } }],
        }),
      });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    const openPageCard = async () => {
      const box = await page.locator("#page").boundingBox();
      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      await clickShadow(page, ".omni-ai-quick-btn");
    };
    // First pass: Summarize lands in the cache.
    await openPageCard();
    await waitShadow(page, ".omni-ai-suggestion-content");
    await clickShadow(page, '.omni-ai-menu-item[data-action="summarize"]');
    await waitShadow(page, ".omni-ai-result-text");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        !document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-overlay"),
    );
    // A language change keeps the translation out of the cache, so it lands
    // again with a size follow; Summarize stays cached and renders at once.
    await sw.evaluate(() => chrome.storage.sync.set({ primaryLanguage: "fr" }));
    await openPageCard();
    // Pick Summarize the frame the translation's size follow starts.
    await page.waitForFunction(
      () => {
        const root = document.getElementById("omni-ai-shadow-host")?.shadowRoot;
        const card = root?.querySelector(".omni-ai-overlay");
        const ready =
          card &&
          root.querySelector(".omni-ai-suggestion-content") &&
          card
            .getAnimations()
            .some((a) =>
              /** @type {KeyframeEffect} */ (a.effect).getKeyframes().some((k) => "width" in k),
            );
        if (ready) root.querySelector('.omni-ai-menu-item[data-action="summarize"]').click();
        return ready;
      },
      null,
      { timeout: 8000, polling: "raf" },
    );
    await waitShadow(page, ".omni-ai-result-text");
    await page.waitForFunction(
      () => {
        const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
        const card = root.querySelector(".omni-ai-overlay");
        const inner = root.querySelector(".omni-ai-surface-inner");
        return (
          [...card.getAnimations(), ...inner.getAnimations()].every(
            (a) => a.playState !== "running",
          ) && Boolean(root.querySelector(".omni-ai-result-text"))
        );
      },
      null,
      { timeout: 8000, polling: "raf" },
    );
    const m = await page.evaluate(() => {
      const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
      const card = root.querySelector(".omni-ai-overlay");
      const inner = root.querySelector(".omni-ai-surface-inner");
      return {
        pinned: inner.style.width,
        inner: inner.offsetWidth,
        card: card.clientWidth,
        width: card.offsetWidth,
      };
    });
    expect(m.pinned).toBe("");
    expect(m.width).toBe(320);
    expect(m.inner).toBe(m.card);
  });
});
