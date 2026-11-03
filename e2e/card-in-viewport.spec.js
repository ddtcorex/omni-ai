const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// The card stays inside the window on every frame (owner report: a long
// selection translated drew the card past the bottom of the window). When
// neither side of the selection has room, the card overlaps the selection
// rather than leave the viewport, and its body scrolls. The page never moves.

const MARGIN = 8;
const LONG = Array.from(
  { length: 18 },
  (_, i) =>
    `Line ${i + 1}: the translated text keeps going so the card needs far more room than the window has.`,
).join("\n");
const PARAGRAPH = "Some long page text that wraps over many lines in a narrow column. ".repeat(40);

// A narrow column of page text at `top` (document px), `lines` tall-ish.
const PAGE = (top, extra = "") => `<!doctype html><html><body style="margin:0;${extra}">
  <div id="long" style="position:absolute;top:${top}px;left:40px;width:360px;font:14px/20px sans-serif">${PARAGRAPH}</div>
  <textarea id="field" rows="4" cols="40" style="position:absolute;top:${top}px;left:600px">Hello world, this is a test.</textarea>
</body></html>`;

async function seedConfig(sw, flashActions = []) {
  await sw.evaluate(async (actions) => {
    for (let i = 0; i < 50; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: actions },
    });
    await chrome.storage.sync.set({ omni_ai_theme: "light" });
  }, flashActions);
}

function stubGemini(context) {
  return context.route("**/generativelanguage.googleapis.com/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/models"))
      return route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' });
    await new Promise((r) => setTimeout(r, 150));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: LONG }] } }] }),
    });
  });
}

// Records the card's rect, the viewport and the scroll on every frame.
function startSampling(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__cardFrames = [];
    w.__sampling = true;
    const tick = () => {
      const card = document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-overlay");
      if (card && card.style.visibility !== "hidden") {
        const r = card.getBoundingClientRect();
        w.__cardFrames.push({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          vh: window.innerHeight,
          vw: document.documentElement.clientWidth,
          scrollY: window.scrollY,
        });
      }
      if (w.__sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampling(page) {
  return page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__sampling = false;
    return w.__cardFrames;
  });
}

function expectEveryFrameInside(frames, scrollY) {
  expect(frames.length).toBeGreaterThan(10);
  for (const f of frames) {
    expect(f.top).toBeGreaterThanOrEqual(MARGIN - 0.5);
    expect(f.bottom).toBeLessThanOrEqual(f.vh - MARGIN + 0.5);
    expect(f.left).toBeGreaterThanOrEqual(MARGIN - 0.5);
    expect(f.right).toBeLessThanOrEqual(f.vw - MARGIN + 0.5);
    expect(f.scrollY).toBe(scrollY);
  }
}

// Real mouse drag over the text from viewport y `fromY` to `toY`.
async function dragText(page, fromY, toY) {
  await page.mouse.move(42, fromY);
  await page.mouse.down();
  await page.mouse.move(390, toY, { steps: 10 });
  await page.mouse.up();
}

// Click the quick button with the mouse where it sits (no Playwright scroll).
async function clickQuickButton(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("omni-ai-shadow-host")?.shadowRoot;
      const toolbar = root?.querySelector(".omni-ai-toolbar");
      const btn = root?.querySelector(".omni-ai-quick-btn");
      if (!toolbar || !btn || toolbar.getAnimations().some((a) => a.playState === "running"))
        return false;
      const r = btn.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    },
    null,
    { timeout: 8000 },
  );
  const c = await page.evaluate(() => {
    const r = document
      .getElementById("omni-ai-shadow-host")
      .shadowRoot.querySelector(".omni-ai-quick-btn")
      .getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(c.x, c.y);
}

async function waitTranslationSettled(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("omni-ai-shadow-host")?.shadowRoot;
      const card = root?.querySelector(".omni-ai-overlay");
      return (
        card &&
        root.querySelector(".omni-ai-suggestion-content, .omni-ai-result-text") &&
        card.getAnimations().every((a) => a.playState !== "running")
      );
    },
    null,
    { timeout: 8000, polling: "raf" },
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

async function withPage(html, viewport, body, flashActions) {
  const { server, port } = await serveFixtureHtml(html);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, flashActions);
    await stubGemini(context);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${port}/`);
    await body(page);
  } finally {
    await context.close();
    server.close();
  }
}

const VIEWPORTS = [
  { width: 1400, height: 900 },
  { width: 1280, height: 640 },
];

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;

  // [name, text top (doc px), page scroll, selection from/to as viewport y fractions]
  for (const [name, top, scroll, from, to] of [
    ["a selection near the middle", 200, 0, 0.4, 0.55],
    ["a selection near the bottom", 200, 0, 0.8, 0.92],
    ["a selection covering most of the window", 20, 0, 0.05, 0.92],
    ["a selection near the bottom of a scrolled page", 900, 700, 0.78, 0.9],
  ]) {
    test(`${tag}: the page card for ${name} stays inside the window on every frame`, async () => {
      const extra = scroll ? "height:4000px" : "";
      await withPage(PAGE(top, extra), viewport, async (page) => {
        if (scroll) await page.evaluate((y) => window.scrollTo(0, y), scroll);
        const scrollY = await page.evaluate(() => window.scrollY);
        await dragText(page, viewport.height * from, viewport.height * to);
        await startSampling(page);
        await clickQuickButton(page);
        await waitTranslationSettled(page);
        expectEveryFrameInside(await stopSampling(page), scrollY);
      });
    });
  }

  test(`${tag}: a quick translate flash action on a long selection stays inside the window`, async () => {
    await withPage(
      PAGE(20),
      viewport,
      async (page) => {
        await dragText(page, viewport.height * 0.05, viewport.height * 0.92);
        await page.waitForFunction(() =>
          document
            .getElementById("omni-ai-shadow-host")
            ?.shadowRoot?.querySelector(".omni-ai-quick-btn"),
        );
        await startSampling(page);
        const btn = await page.evaluate(() => {
          const r = document
            .getElementById("omni-ai-shadow-host")
            .shadowRoot.querySelector(".omni-ai-quick-btn")
            .getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await page.mouse.move(btn.x, btn.y);
        await page.waitForFunction(
          () =>
            document
              .getElementById("omni-ai-shadow-host")
              ?.shadowRoot?.querySelector('[data-flash-action="smart_translate"]')
              ?.getBoundingClientRect().width > 10,
          null,
          { timeout: 5000 },
        );
        await page.evaluate(() =>
          document
            .getElementById("omni-ai-shadow-host")
            .shadowRoot.querySelector('[data-flash-action="smart_translate"]')
            .click(),
        );
        await waitTranslationSettled(page);
        expectEveryFrameInside(await stopSampling(page), 0);
      },
      ["smart_translate"],
    );
  });

  test(`${tag}: a long editor result stays inside the window on every frame`, async () => {
    await withPage(PAGE(viewport.height - 140), viewport, async (page) => {
      await page.evaluate(() => {
        const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("field"));
        el.focus();
        el.setSelectionRange(6, 11);
      });
      await page.locator("#field").dispatchEvent("mouseup");
      await clickQuickButton(page);
      await page.waitForFunction(() =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector('.omni-ai-menu-item[data-action="rephrase"]'),
      );
      await startSampling(page);
      await page.evaluate(() =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector('.omni-ai-menu-item[data-action="rephrase"]')
          .click(),
      );
      await waitTranslationSettled(page);
      expectEveryFrameInside(await stopSampling(page), 0);
    });
  });
}

// Text against the right edge: the card is clamped left so its final width
// fits, and the width spring's overshoot must not cross the right margin.
const PAGE_RIGHT = `<!doctype html><html><body style="margin:0">
  <div id="long" style="position:absolute;top:200px;right:20px;width:300px;font:14px/20px sans-serif">${PARAGRAPH}</div>
</body></html>`;

for (const viewport of VIEWPORTS) {
  test(`${viewport.width}x${viewport.height}: a page card widening at the right edge stays inside the window on every frame`, async () => {
    await withPage(PAGE_RIGHT, viewport, async (page) => {
      const box = await page.locator("#long").boundingBox();
      await page.mouse.move(box.x + 2, box.y + 5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 5, box.y + 45, { steps: 8 });
      await page.mouse.up();
      await startSampling(page);
      await clickQuickButton(page);
      await waitTranslationSettled(page);
      const frames = await stopSampling(page);
      expect(Math.max(...frames.map((f) => f.right - f.left))).toBeGreaterThan(320);
      expectEveryFrameInside(frames, 0);
    });
  });
}
