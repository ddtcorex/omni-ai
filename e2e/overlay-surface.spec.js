const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Every overlay state (menu, loading, result, ...) renders through the one
// morphing card owned by content/ui/surface.js: the card element is reused
// across states and only leaves the DOM once its exit animation finishes.

const FIXTURE = `<!doctype html><html><body>
  <textarea id="target" rows="3" cols="40">Hello world, this is a test.</textarea>
  <p id="other" style="margin-top:200px">Some other plain page text to select.</p>
</body></html>`;

async function seedConfig(sw) {
  // onInstalled's initializeSettings() writes chrome.storage.local
  // asynchronously; wait for it to finish before overriding, so our seed
  // isn't the one that loses the race and gets clobbered by the defaults.
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

function stubGemini(context, replyText) {
  return context.route("**/generativelanguage.googleapis.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: replyText }] } }] }),
    });
  });
}

function shadowQuery(page, selector) {
  return page.evaluateHandle(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q) || null,
    selector,
  );
}

function shadowCount(page, selector) {
  return page.evaluate(
    (q) =>
      document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelectorAll(q).length || 0,
    selector,
  );
}

// Real mouse click on an element inside the Omni AI shadow root.
async function clickShadow(page, selector) {
  await page.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
  const handle = await shadowQuery(page, selector);
  await handle.asElement().click();
}

async function openEditorMenu(page, port, mouse = undefined) {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => {
    const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
    el.focus();
    el.setSelectionRange(6, 11); // selects "world"
  });
  await page.locator("#target").dispatchEvent("mouseup", mouse);
  await clickShadow(page, ".omni-ai-quick-btn");
  await page.waitForFunction(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector('.omni-ai-menu-item[data-action="rephrase"]'),
    null,
    { timeout: 8000 },
  );
}

test("menu, loading and result reuse one overlay element", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD-IMPROVED");
    const page = await context.newPage();
    await openEditorMenu(page, port);

    const card = await shadowQuery(page, ".omni-ai-overlay");
    expect(await card.evaluate((el) => el.querySelectorAll(".omni-ai-surface-inner").length)).toBe(
      1,
    );

    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-result-text")
          ?.textContent.includes("IMPROVED"),
      null,
      { timeout: 8000 },
    );

    expect(await card.evaluate((el) => el.isConnected)).toBe(true);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(1);
    expect(await card.evaluate((el) => el.querySelectorAll(".omni-ai-surface-inner").length)).toBe(
      1,
    );
  } finally {
    await context.close();
    server.close();
  }
});

test("the editor menu has no header and closes on a click outside", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await openEditorMenu(page, port);

    // Only the action pills and the Ask box, as in the prototype.
    const children = await page.evaluate(() =>
      Array.from(
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-surface-inner").children,
      ).map((el) => el.className),
    );
    expect(children).toEqual(["omni-ai-menu-grid", "omni-ai-input-wrapper"]);
    expect(await shadowCount(page, ".omni-ai-overlay-header")).toBe(0);
    expect(await shadowCount(page, "#omniAiClose")).toBe(0);

    await page.mouse.click(600, 500);
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("closing waits for the exit animation", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD-IMPROVED");
    const page = await context.newPage();
    await openEditorMenu(page, port);

    const card = await shadowQuery(page, ".omni-ai-overlay");
    // Click and probe in the same task so the check runs right after the
    // click handler, before the 160 ms exit animation can finish.
    const connectedRightAfterClick = await page.evaluate(() => {
      const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
      const el = root.querySelector(".omni-ai-overlay");
      // The editor menu has no header: Escape closes it.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return el.isConnected;
    });
    expect(connectedRightAfterClick).toBe(true);

    await expect
      .poll(() => card.evaluate((el) => el.isConnected), { timeout: 500, intervals: [25] })
      .toBe(false);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("a new selection closes the open card", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD-IMPROVED");
    const page = await context.newPage();
    await openEditorMenu(page, port);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(1);

    const box = await page.locator("#other").boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn"), { timeout: 2000 }).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("opening the menu in an editor sends no AI request", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    let aiRequests = 0;
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      aiRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "X" }] } }] }),
      });
    });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.waitForTimeout(1500);
    expect(aiRequests).toBe(0);
    expect(await shadowCount(page, "#omniAiMagicFix")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("the floating icon stays visible while the card is open", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD-IMPROVED");
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.waitForTimeout(300);
    expect(await shadowCount(page, ".omni-ai-quick-btn")).toBe(1);

    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-result-text")
          ?.textContent.includes("IMPROVED"),
      null,
      { timeout: 8000 },
    );
    expect(await shadowCount(page, ".omni-ai-quick-btn")).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("a card opened above the selection grows upward", async () => {
  // Not scrollable on purpose: the toolbar sits flush with the viewport bottom,
  // and Playwright answers a click on a barely clipped target by scrolling the
  // page (scrollY 698 in the flaky runs), which moves the document-positioned
  // toolbar and the card with it.
  const BOTTOM_FIXTURE = `<!doctype html><html><body style="margin:0">
    <textarea id="target" rows="3" cols="40" style="position:fixed;bottom:10px;left:40px">Hello world, this is a test.</textarea>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(BOTTOM_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "word ".repeat(120).trim() + " LONG-DONE");
    const page = await context.newPage();
    // A real selection ends at the mouse, so the toolbar lands near it.
    await openEditorMenu(page, port, { clientX: 300, clientY: 690 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.waitForTimeout(900);

    const cardBottom = () =>
      page.evaluate(() => {
        const el = document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-overlay");
        return el.getBoundingClientRect().bottom;
      });
    const toolbarTop = await page.evaluate(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-quick-btn")
          .getBoundingClientRect().top,
    );
    const before = await cardBottom();
    expect(before).toBeLessThanOrEqual(toolbarTop);
    // An editor's selection has no measurable range: the field's top edge is
    // the bound, so the card never covers the field either.
    const fieldTop = await page.evaluate(
      () => document.getElementById("target").getBoundingClientRect().top,
    );
    expect(before).toBeLessThanOrEqual(fieldTop);

    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-result-text")
          ?.textContent.includes("LONG-DONE"),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(700); // height morph settles
    const after = await cardBottom();
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    const top = await page.evaluate(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-overlay")
          .getBoundingClientRect().top,
    );
    expect(top).toBeGreaterThanOrEqual(0);
  } finally {
    await context.close();
    server.close();
  }
});

// Page text near the bottom of a scrolled page, selected with a real mouse
// drag so the toolbar lands at the mouse (just under the selected line).
const BELOW_FOLD = (
  bodyStyle,
) => `<!doctype html><html><body style="margin:0;height:3000px;${bodyStyle}">
  <p id="line" style="position:absolute;top:1650px;left:40px;margin:0">Some plain page text near the bottom to select.</p>
</body></html>`;

async function openCardOnBelowFoldText(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => window.scrollTo(0, 1000));
  const box = await page.locator("#line").boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await clickShadow(page, ".omni-ai-quick-btn");
  await page.waitForFunction(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector("#omniAiTranslateCard"),
    null,
    { timeout: 8000 },
  );
  await page.waitForTimeout(800); // enter animation settles
}

async function expectCardAboveSelection(page) {
  const m = await page.evaluate(() => {
    const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
    const card = root.querySelector(".omni-ai-overlay").getBoundingClientRect();
    const tb = root.querySelector(".omni-ai-quick-btn").getBoundingClientRect();
    const sel = window.getSelection().getRangeAt(0).getBoundingClientRect();
    return {
      cardTop: card.top,
      cardBottom: card.bottom,
      toolbarTop: tb.top,
      selTop: sel.top,
      vh: window.innerHeight,
    };
  });
  // Fully inside the viewport.
  expect(m.cardTop).toBeGreaterThanOrEqual(0);
  expect(m.cardBottom).toBeLessThanOrEqual(m.vh);
  // Bottom edge one gap above the selection or the toolbar, whichever is higher.
  const expected = Math.min(m.selTop, m.toolbarTop) - 8;
  expect(Math.abs(m.cardBottom - expected)).toBeLessThanOrEqual(2);
}

for (const [name, bodyStyle] of [
  ["a static body", ""],
  ["a position:relative body", "position:relative;"],
  ["a transformed body", "transform:translateZ(0);"],
]) {
  test(`an above card sits over the selection edge with ${name}`, async () => {
    const { server, port } = await serveFixtureHtml(BELOW_FOLD(bodyStyle));
    const { context, sw } = await launchWithExtension();
    try {
      await seedConfig(sw);
      await stubGemini(context, "TRANSLATED");
      const page = await context.newPage();
      await openCardOnBelowFoldText(page, port);
      await expectCardAboveSelection(page);
    } finally {
      await context.close();
      server.close();
    }
  });
}

test("closing the card mid flash action leaves no spinner on the toolbar", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await sw.evaluate(async () => {
      await chrome.storage.local.set({
        settings: { showFloatingButton: true, flashActions: ["rephrase"] },
      });
    });
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: "LATE" }] } }] }),
      });
    });
    const page = await context.newPage();
    await openEditorMenu(page, port);

    const btn = await shadowQuery(page, ".omni-ai-quick-btn");
    await btn.asElement().hover();
    await clickShadow(page, '[data-flash-action="rephrase"]');
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-quick-btn .ds-spinner"),
      null,
      { timeout: 3000 },
    );

    // Let the loading state finish swapping in before closing.
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-loading"),
      null,
      { timeout: 3000 },
    );
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector("#omniAiClose")
        .click();
    });
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);

    const idle = () =>
      page.evaluate(() => {
        const el = document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-quick-btn");
        return { spinner: !!el.querySelector(".ds-spinner"), cursor: el.style.cursor };
      });
    expect(await idle()).toEqual({ spinner: false, cursor: "" });
    // The stale response arrives and is dropped; the toolbar stays idle.
    await page.waitForTimeout(2000);
    expect(await idle()).toEqual({ spinner: false, cursor: "" });
  } finally {
    await context.close();
    server.close();
  }
});

async function expectCardAboveToolbarInViewport(page) {
  const m = await page.evaluate(() => {
    const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
    const card = root.querySelector(".omni-ai-overlay").getBoundingClientRect();
    const tb = root.querySelector(".omni-ai-quick-btn").getBoundingClientRect();
    return { cardTop: card.top, cardBottom: card.bottom, toolbarTop: tb.top, vh: innerHeight };
  });
  expect(m.cardTop).toBeGreaterThanOrEqual(0);
  expect(m.cardBottom).toBeLessThanOrEqual(m.vh);
  expect(m.cardBottom).toBeLessThanOrEqual(m.toolbarTop);
}

test("a field taller than the viewport with its top scrolled away still opens the card above the toolbar", async () => {
  const TALL = `<!doctype html><html><body style="margin:0;height:3000px">
    <textarea id="target" style="position:absolute;top:0;left:40px;width:400px;height:1800px">Hello world, this is a test.</textarea>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(TALL);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "X");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      window.scrollTo(0, 500);
      const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await page.locator("#target").dispatchEvent("mouseup", { clientX: 300, clientY: 690 });
    await clickShadow(page, ".omni-ai-quick-btn");
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector('.omni-ai-menu-item[data-action="rephrase"]'),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(800);
    await expectCardAboveToolbarInViewport(page);
  } finally {
    await context.close();
    server.close();
  }
});

test("a long page selection whose start is scrolled away still opens the card above the toolbar", async () => {
  const LONG = `<!doctype html><html><body style="margin:0;height:3000px">
    <div id="long" style="position:absolute;top:100px;left:40px;width:400px;line-height:20px">${"Long page text. ".repeat(600)}</div>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(LONG);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "X");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("long"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      window.scrollTo(0, 700);
    });
    await page.locator("#long").dispatchEvent("mouseup", { clientX: 300, clientY: 690 });
    await clickShadow(page, ".omni-ai-quick-btn");
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector("#omniAiTranslateCard"),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(800);
    await expectCardAboveToolbarInViewport(page);
  } finally {
    await context.close();
    server.close();
  }
});

test("menu actions wrap as pills, primary four first", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.waitForTimeout(600); // let the pill stagger settle

    const items = await page.evaluate(() =>
      Array.from(
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelectorAll("button.omni-ai-menu-item[data-action]"),
      ).map((el) => ({
        action: el.dataset.action,
        primary: el.classList.contains("is-primary"),
        whiteSpace: getComputedStyle(el).whiteSpace,
      })),
    );
    expect(items.map((i) => i.action)).toEqual([
      "rephrase",
      "grammar",
      "tone",
      "summarize",
      "explain",
      "reply",
      "emoji",
      "translate_primary",
      "translate_default",
    ]);
    expect(items.filter((i) => i.primary).map((i) => i.action)).toEqual([
      "rephrase",
      "grammar",
      "tone",
      "summarize",
    ]);
    for (const item of items) expect(item.whiteSpace).toBe("nowrap");
    // The Ask box follows the pills.
    expect(await shadowCount(page, "#omniAiInlineInput")).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("German labels are never truncated in the menu", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    // The overlay's own i18n follows the Primary Language setting (see
    // quick-action-modal.spec.js "overlay language updates live").
    await sw.evaluate(async () => {
      await chrome.storage.sync.set({ primaryLanguage: "de", defaultLanguage: "en" });
    });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.waitForTimeout(600);

    // A pill is nowrap with no max-width, so its own scrollWidth never
    // exceeds its clientWidth; the real failure is a pill wider than the
    // card, clipped by the card's overflow. Measure each pill against the
    // pill container's content box and the card's inner width.
    const { items, cardInner, contentRight } = await page.evaluate(() => {
      const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
      const card = root.querySelector(".omni-ai-overlay");
      const grid = root.querySelector(".omni-ai-menu-grid");
      const gridRect = grid.getBoundingClientRect();
      const gridStyle = getComputedStyle(grid);
      return {
        cardInner: card.clientWidth,
        contentRight: gridRect.right - parseFloat(gridStyle.paddingRight),
        items: Array.from(root.querySelectorAll("button.omni-ai-menu-item[data-action]")).map(
          (el) => ({
            text: el.textContent.trim(),
            right: el.getBoundingClientRect().right,
            offsetWidth: el.offsetWidth,
          }),
        ),
      };
    });
    expect(items.map((i) => i.text)).toContain("Grammatik prüfen");
    expect(items.map((i) => i.text)).toContain("Emojis hinzufügen");
    for (const item of items) {
      expect(item.right).toBeLessThanOrEqual(contentRight + 0.5);
      expect(item.offsetWidth).toBeLessThanOrEqual(cardInner);
    }
  } finally {
    await context.close();
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Loading, result, retry, tone, copy, error, ask and page card states.
// ---------------------------------------------------------------------------

// Gemini stub with a call counter, an optional delay and a reply per call.
function stubGeminiCounted(context, { delayMs = 0, reply = () => "OK", status = 200 } = {}) {
  const state = { hits: 0, bodies: [] };
  const handler = async (route) => {
    state.hits += 1;
    const n = state.hits;
    state.bodies.push(route.request().postData() || "");
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const code = typeof status === "function" ? status(n) : status;
    await route.fulfill({
      status: code,
      contentType: "application/json",
      body:
        code === 200
          ? JSON.stringify({ candidates: [{ content: { parts: [{ text: reply(n) }] } }] })
          : JSON.stringify({ error: { message: "<b>bad</b> key" } }),
    });
  };
  return context.route("**/generativelanguage.googleapis.com/**", handler).then(() => state);
}

function waitShadow(page, selector, timeout = 8000) {
  return page.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout },
  );
}

function waitResultText(page, needle, timeout = 8000) {
  return page.waitForFunction(
    (n) =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-result-text")
        ?.textContent.includes(n),
    needle,
    { timeout },
  );
}

function shadowText(page, selector) {
  return page.evaluate(
    (q) =>
      document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q)?.textContent ??
      null,
    selector,
  );
}

const PAGE_FIXTURE = `<!doctype html><html><body>
  <p id="target" style="margin:120px 40px">The quick brown fox jumps over the lazy dog.</p>
</body></html>`;

async function openPageCard(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`);
  const box = await page.locator("#target").boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await clickShadow(page, ".omni-ai-quick-btn");
  await waitShadow(page, "#omniAiTranslateCard");
}

async function sendToTab(sw, port, message) {
  await sw.evaluate(
    async ({ port, message }) => {
      const tabs = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
      let lastError;
      for (let i = 0; i < 20; i++) {
        try {
          await chrome.tabs.sendMessage(tabs[0].id, message, { frameId: 0 });
          return;
        } catch (err) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      throw lastError;
    },
    { port, message },
  );
}

test("loading shows a skeleton and the action name", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { delayMs: 1500, reply: () => "DONE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitShadow(page, ".omni-ai-skeleton");
    expect(await shadowCount(page, ".omni-ai-skeleton .omni-ai-skeleton-line")).toBe(3);
    expect(await shadowText(page, ".omni-ai-overlay-header")).toContain("Rephrase");
    expect(await shadowCount(page, ".omni-ai-overlay .ds-spinner")).toBe(0);
    await waitResultText(page, "DONE");
    expect(await shadowCount(page, ".omni-ai-skeleton")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("result shows clean text; Show changes reveals the diff", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: () => "planet" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "planet");
    expect(await shadowText(page, ".omni-ai-result-text")).toBe("planet");
    expect(await shadowCount(page, ".omni-ai-diff-del")).toBe(0);

    await clickShadow(page, "#omniAiShowChanges");
    await waitShadow(page, ".omni-ai-result-text .omni-ai-diff-del");
    expect(await shadowText(page, ".omni-ai-diff-del")).toBe("world");
    expect(await shadowText(page, ".omni-ai-diff-ins")).toBe("planet");
    expect(
      await page.evaluate(() =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector("#omniAiShowChanges")
          .getAttribute("aria-checked"),
      ),
    ).toBe("true");

    // Toggling off goes back to the clean text.
    await clickShadow(page, "#omniAiShowChanges");
    await expect.poll(() => shadowCount(page, ".omni-ai-diff-del")).toBe(0);
    expect(await shadowText(page, ".omni-ai-result-text")).toBe("planet");
  } finally {
    await context.close();
    server.close();
  }
});

test("Show changes is absent for summarize and translations", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: (n) => `REPLY-${n}` });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="summarize"]');
    await waitResultText(page, "REPLY-1");
    expect(await shadowCount(page, "#omniAiShowChanges")).toBe(0);

    await clickShadow(page, "#omniAiBack");
    await clickShadow(page, '.omni-ai-menu-item[data-action="translate_primary"]');
    await waitResultText(page, "REPLY-2");
    expect(await shadowCount(page, "#omniAiShowChanges")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("AI output with markup renders as text", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: () => `<img src=x onerror="window.__pwned=1">` });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "<img");
    expect(await shadowCount(page, ".omni-ai-result-text img")).toBe(0);
    // With the diff shown too.
    await clickShadow(page, "#omniAiShowChanges");
    await waitShadow(page, ".omni-ai-result-text .omni-ai-diff-ins");
    expect(await shadowCount(page, ".omni-ai-result-text img")).toBe(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  } finally {
    await context.close();
    server.close();
  }
});

test("retry calls the AI again even for a cached action", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { reply: (n) => `GRAMMAR-${n}` });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="grammar"]');
    await waitResultText(page, "GRAMMAR-1");
    expect(stub.hits).toBe(1);

    await clickShadow(page, "#omniAiRetry");
    await waitResultText(page, "GRAMMAR-2");
    expect(stub.hits).toBe(2);

    // The retried result replaced the old one: Back goes to the menu.
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, ".omni-ai-menu-grid");
    // And the fresh result replaced the cache entry.
    await clickShadow(page, '.omni-ai-menu-item[data-action="grammar"]');
    await waitResultText(page, "GRAMMAR-2");
    expect(stub.hits).toBe(2);
  } finally {
    await context.close();
    server.close();
  }
});

test("a late response after Back is dropped", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { delayMs: 1500, reply: () => "LATE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForTimeout(200);
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, ".omni-ai-menu-grid");
    await page.waitForTimeout(2500);
    expect(await shadowCount(page, ".omni-ai-menu-grid")).toBe(1);
    expect(await shadowCount(page, ".omni-ai-result-text")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("a late response after the card closed does not reopen it", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { delayMs: 1500, reply: () => "LATE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitShadow(page, ".omni-ai-skeleton");
    await clickShadow(page, "#omniAiClose");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await expect.poll(() => stub.hits, { timeout: 3000 }).toBe(1);
    await page.waitForTimeout(2500);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("Change tone shows the five tones and re-runs in place", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { reply: (n) => `TONE-${n}` });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    const card = await shadowQuery(page, ".omni-ai-overlay");
    await clickShadow(page, '.omni-ai-menu-item[data-action="tone"]');
    await waitResultText(page, "TONE-1");

    const tones = () =>
      page.evaluate(() =>
        Array.from(
          document
            .getElementById("omni-ai-shadow-host")
            .shadowRoot.querySelectorAll(".omni-ai-tone-pill"),
        ).map((el) => ({ tone: el.dataset.tone, active: el.classList.contains("is-active") })),
      );
    expect((await tones()).map((t) => t.tone)).toEqual([
      "professional",
      "casual",
      "friendly",
      "direct",
      "confident",
    ]);
    expect((await tones()).filter((t) => t.active).map((t) => t.tone)).toEqual(["professional"]);

    await clickShadow(page, '.omni-ai-tone-pill[data-tone="casual"]');
    await waitResultText(page, "TONE-2");
    expect(stub.hits).toBe(2);
    expect(stub.bodies[1].toLowerCase()).toContain("casual");
    expect((await tones()).filter((t) => t.active).map((t) => t.tone)).toEqual(["casual"]);
    expect(await card.evaluate((el) => el.isConnected)).toBe(true);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(1);

    // The tone re-run replaced the result: Back goes straight to the menu.
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, ".omni-ai-menu-grid");
    expect(await shadowCount(page, ".omni-ai-result-text")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("two quick tone clicks show the last one", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    // The first tone re-run is slow, the second fast: the slow one must not win.
    await stubGeminiCounted(context, {
      delayMs: 0,
      reply: (n) => `TONE-${n}`,
    });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="tone"]');
    await waitResultText(page, "TONE-1");
    await context.unrouteAll({ behavior: "ignoreErrors" });
    let hits = 0;
    await context.route("**/generativelanguage.googleapis.com/**", async (route) => {
      hits += 1;
      const n = hits;
      const body = route.request().postData() || "";
      await new Promise((r) => setTimeout(r, n === 1 ? 1500 : 100));
      const text = body.toLowerCase().includes("friendly") ? "FRIENDLY" : "CASUAL";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      });
    });
    await clickShadow(page, '.omni-ai-tone-pill[data-tone="casual"]');
    await page.waitForTimeout(150);
    await clickShadow(page, '.omni-ai-tone-pill[data-tone="friendly"]');
    await waitResultText(page, "FRIENDLY");
    await page.waitForTimeout(2000);
    expect(await shadowText(page, ".omni-ai-result-text")).toBe("FRIENDLY");
  } finally {
    await context.close();
    server.close();
  }
});

test("Copy swaps to the copied label and back", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: `http://127.0.0.1:${port}`,
    });
    await stubGeminiCounted(context, { reply: () => "COPY-ME" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "COPY-ME");
    expect(await shadowText(page, "#omniAiCopy")).toContain("Copy");
    await clickShadow(page, "#omniAiCopy");
    await expect.poll(() => shadowText(page, "#omniAiCopy"), { timeout: 2000 }).toContain("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("COPY-ME");
    await expect
      .poll(() => shadowText(page, "#omniAiCopy"), { timeout: 4000 })
      .not.toContain("Copied");
    expect(await shadowText(page, "#omniAiCopy")).toContain("Copy");
  } finally {
    await context.close();
    server.close();
  }
});

test("an AI failure shows the error inside the card with Try again", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    let fail = true;
    const stub = await stubGeminiCounted(context, {
      reply: () => "RECOVERED",
      status: () => (fail ? 400 : 200),
    });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    const card = await shadowQuery(page, ".omni-ai-overlay");
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitShadow(page, ".omni-ai-overlay .omni-ai-error", 15000);
    expect(await card.evaluate((el) => el.isConnected)).toBe(true);
    // The provider's message is shown as text, never as markup.
    expect(await shadowText(page, ".omni-ai-error")).toContain("<b>bad</b> key");
    expect(await shadowCount(page, ".omni-ai-error b")).toBe(0);
    expect(await shadowText(page, "#omniAiRetry")).toContain("Try again");

    fail = false;
    const before = stub.hits;
    await clickShadow(page, "#omniAiRetry");
    await waitResultText(page, "RECOVERED");
    expect(stub.hits).toBe(before + 1);
  } finally {
    await context.close();
    server.close();
  }
});

test("page text: the translation slot is reserved and the action pills do not move when it lands", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { delayMs: 1500, reply: () => "Con cáo nâu nhanh nhẹn." });
    const page = await context.newPage();
    await openPageCard(page, port);
    await waitShadow(page, "#omniAiTranslateCard .omni-ai-skeleton");
    await page.waitForTimeout(700); // enter animation settles
    const pillY = () =>
      page.evaluate(
        () =>
          document
            .getElementById("omni-ai-shadow-host")
            .shadowRoot.querySelector(".omni-ai-menu-item[data-action]")
            .getBoundingClientRect().y,
      );
    const before = await pillY();
    await page.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector("#omniAiTranslateCard .omni-ai-suggestion-content")
          ?.textContent.includes("Con cáo"),
      null,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);
    expect(Math.abs((await pillY()) - before)).toBeLessThanOrEqual(0.5);

    // Reading actions only, in order, then the reading Ask box.
    const actions = await page.evaluate(() =>
      Array.from(
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelectorAll(".omni-ai-menu-item[data-action]"),
      ).map((el) => el.dataset.action),
    );
    // No translate pills: the translation is already on top of the card.
    expect(actions).toEqual(["summarize", "explain", "reply"]);
    expect(
      await page.evaluate(() =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector("#omniAiInlineInput")
          .getAttribute("placeholder"),
      ),
    ).toBe("Ask about this text…");
  } finally {
    await context.close();
    server.close();
  }
});

test("page text: results have Copy and no Replace", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: (n) => `PAGE-${n}` });
    const page = await context.newPage();
    await openPageCard(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="summarize"]');
    await page.waitForFunction(
      () =>
        /PAGE-\d/.test(
          document
            .getElementById("omni-ai-shadow-host")
            ?.shadowRoot?.querySelector(".omni-ai-result-text")?.textContent || "",
        ),
      null,
      { timeout: 8000 },
    );
    expect(await shadowCount(page, "#omniAiCopy")).toBe(1);
    expect(await shadowCount(page, "#omniAiRetry")).toBe(1);
    expect(await shadowCount(page, "#omniAiReplace")).toBe(0);
    // Back returns to the translation-first card.
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, "#omniAiTranslateCard");
  } finally {
    await context.close();
    server.close();
  }
});

test("Quick Ask with no selection opens the ask state with the input focused", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { delayMs: 800, reply: () => "<script>ANSWER</script>" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await sendToTab(sw, port, { type: "SHOW_QUICK_ASK_OVERLAY" });
    await waitShadow(page, "#omniAiInlineInput");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.getElementById("omni-ai-shadow-host").shadowRoot.activeElement?.id,
        ),
      )
      .toBe("omniAiInlineInput");
    expect(await shadowCount(page, ".omni-ai-menu-grid")).toBe(0);
    expect(await shadowCount(page, ".omni-ai-ask-context")).toBe(0);

    await page.keyboard.type("What is <b>this</b>?");
    await page.keyboard.press("Enter");
    // The loading header names Quick Ask, not the brand.
    await waitShadow(page, ".omni-ai-skeleton");
    expect(await shadowText(page, ".omni-ai-overlay-header")).toContain("Quick Ask");
    await waitResultText(page, "ANSWER");
    expect(await shadowCount(page, ".omni-ai-result-text script")).toBe(0);
    expect(await shadowText(page, ".omni-ai-result-query")).toContain("What is <b>this</b>?");
    expect(await shadowCount(page, ".omni-ai-result-query b")).toBe(0);

    // Back from a Quick Ask result returns to the ask state.
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, "#omniAiInlineInput");
    expect(await shadowCount(page, ".omni-ai-result-text")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

// Task 7: keyboard navigation, reduced motion and interaction races.

function shadowActiveAction(page) {
  return page.evaluate(
    () =>
      document.getElementById("omni-ai-shadow-host").shadowRoot.activeElement?.dataset?.action ||
      null,
  );
}

test("arrow keys move focus between menu pills and Enter runs the focused action", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { reply: () => "DONE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    const actions = await page.evaluate(() =>
      [
        ...document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelectorAll(".omni-ai-menu-item[data-action]"),
      ].map((el) => el.dataset.action),
    );
    expect(actions.length).toBeGreaterThan(2);
    // Focus the first pill, then walk the DOM order.
    await page.evaluate(() =>
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector(".omni-ai-menu-item[data-action]")
        .focus(),
    );
    expect(await shadowActiveAction(page)).toBe(actions[0]);
    await page.keyboard.press("ArrowRight");
    expect(await shadowActiveAction(page)).toBe(actions[1]);
    await page.keyboard.press("ArrowDown");
    expect(await shadowActiveAction(page)).toBe(actions[2]);
    await page.keyboard.press("ArrowLeft");
    expect(await shadowActiveAction(page)).toBe(actions[1]);
    await page.keyboard.press("End");
    expect(await shadowActiveAction(page)).toBe(actions[actions.length - 1]);
    await page.keyboard.press("ArrowRight");
    expect(await shadowActiveAction(page)).toBe(actions[0]);
    await page.keyboard.press("Home");
    expect(await shadowActiveAction(page)).toBe(actions[0]);
    await page.keyboard.press("ArrowLeft");
    expect(await shadowActiveAction(page)).toBe(actions[actions.length - 1]);

    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await waitResultText(page, "DONE");
    await expect.poll(() => stub.hits).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("Escape closes the card from any state, with focus left in the editor", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: () => "RESULT" });
    const page = await context.newPage();
    // Opening through the toolbar never moves focus: it stays in the editor.
    await openEditorMenu(page, port);
    const focusEditor = () => page.evaluate(() => document.getElementById("target").focus());
    const editorFocused = () => page.evaluate(() => document.activeElement?.id === "target");
    // Menu.
    expect(await editorFocused()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    // Result.
    await openEditorMenu(page, port);
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "RESULT");
    await focusEditor();
    expect(await editorFocused()).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("a keyboard command card closes on Escape with no focus in it", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await sendToTab(sw, port, { type: "PROCESSING_START", action: "rephrase" });
    await waitShadow(page, ".omni-ai-skeleton");
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("with no card open, Escape still reaches the page", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await page.evaluate(() => {
      globalThis.__pageEscapes = 0;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") globalThis.__pageEscapes += 1;
      });
    });
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => globalThis.__pageEscapes)).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("under reduced motion the card still opens and closes, with no transform animation", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await page.locator("#target").dispatchEvent("mouseup");
    await waitShadow(page, ".omni-ai-quick-btn");
    // Sample every running animation on the card while it opens and closes.
    const sampler = page.evaluate(
      () =>
        new Promise((resolve) => {
          const root = document.getElementById("omni-ai-shadow-host").shadowRoot;
          const props = new Set();
          let seen = 0;
          const start = performance.now();
          const tick = () => {
            const card = root.querySelector(".omni-ai-overlay");
            if (card) {
              card.getAnimations().forEach((a) => {
                seen += 1;
                a.effect.getKeyframes().forEach((k) => Object.keys(k).forEach((n) => props.add(n)));
              });
            }
            if (performance.now() - start < 1500) requestAnimationFrame(tick);
            else resolve({ props: [...props], seen });
          };
          tick();
        }),
    );
    await clickShadow(page, ".omni-ai-quick-btn");
    await waitShadow(page, ".omni-ai-menu-grid");
    // Escape alone closes it: no Close click to fall back on.
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    const { props, seen } = await sampler;
    expect(seen).toBeGreaterThan(0);
    expect(props).toContain("opacity");
    expect(props).not.toContain("transform");
    expect(props).not.toContain("filter");
  } finally {
    await context.close();
    server.close();
  }
});

test("double clicking the toolbar icon leaves exactly one card", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await page.locator("#target").dispatchEvent("mouseup");
    await waitShadow(page, ".omni-ai-quick-btn");
    const btn = (await shadowQuery(page, ".omni-ai-quick-btn")).asElement();
    await btn.dblclick();
    await page.waitForTimeout(900);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("closing with Escape right after a state change wins over the morph", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { delayMs: 800, reply: () => "LATE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    await page.evaluate(() =>
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector('.omni-ai-menu-item[data-action="rephrase"]')
        .focus(),
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 600 }).toBe(0);
    await expect.poll(() => stub.hits, { timeout: 3000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});

test("Back from an ask opened in an editor returns to the editor menu", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: () => "ANSWER" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => {
      const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
      el.focus();
      el.setSelectionRange(6, 11);
    });
    await sendToTab(sw, port, { type: "SHOW_QUICK_ASK_OVERLAY" });
    await waitShadow(page, "#omniAiInlineInput");
    await clickShadow(page, "#omniAiBack");
    await waitShadow(page, ".omni-ai-menu-grid");
    // The editor menu, not the page card: no translation slot, Replace-capable actions.
    expect(await shadowCount(page, "#omniAiTranslateCard")).toBe(0);
    expect(await shadowCount(page, '.omni-ai-menu-item[data-action="rephrase"]')).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

// The toolbar belongs to the selection: it stays while the card is open, and
// once the card closes it follows the selection again.

test("Replace removes the toolbar, and the spot where it was leaves the field alone", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { reply: () => "PLANET" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    const spot = await (await shadowQuery(page, ".omni-ai-quick-btn")).asElement().boundingBox();
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "PLANET");
    // Keyboard activation: no mouseup follows, so nothing but Replace itself
    // can deal with the toolbar.
    await page.evaluate(() =>
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector("#omniAiReplace")
        .focus(),
    );
    await page.keyboard.press("Enter");
    const replaced = "Hello PLANET, this is a test.";
    await expect.poll(() => page.locator("#target").inputValue()).toBe(replaced);
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn"), { timeout: 2000 }).toBe(0);

    // A leftover toolbar would open a card for the old text here.
    await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await page.waitForTimeout(600);
    expect(await shadowCount(page, ".omni-ai-overlay")).toBe(0);
    expect(await page.locator("#target").inputValue()).toBe(replaced);
  } finally {
    await context.close();
    server.close();
  }
});

test("closing the card keeps the toolbar of a selection that did not change", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await openEditorMenu(page, port);
    const before = await shadowQuery(page, ".omni-ai-quick-btn");
    await page.keyboard.press("Escape");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await page.waitForTimeout(300);
    expect(await shadowCount(page, ".omni-ai-quick-btn")).toBe(1);
    expect(await before.evaluate((el) => el.isConnected)).toBe(true);
  } finally {
    await context.close();
    server.close();
  }
});

test("a keyboard selection change while the card is open closes it and the toolbar follows", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const stub = await stubGeminiCounted(context, { reply: () => "DONE" });
    const page = await context.newPage();
    await openEditorMenu(page, port);
    // Focus is still in the textarea: Shift+ArrowRight extends "world" to "world,".
    await page.keyboard.press("Shift+ArrowRight");
    expect(
      await page.evaluate(() => {
        const el = /** @type {HTMLTextAreaElement} */ (document.getElementById("target"));
        return el.value.substring(el.selectionStart, el.selectionEnd);
      }),
    ).toBe("world,");
    await expect.poll(() => shadowCount(page, ".omni-ai-overlay"), { timeout: 2000 }).toBe(0);
    await expect.poll(() => shadowCount(page, ".omni-ai-quick-btn"), { timeout: 2000 }).toBe(1);

    // The toolbar now carries the new selection, not the old one.
    await clickShadow(page, ".omni-ai-quick-btn");
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitResultText(page, "DONE");
    expect(stub.bodies.at(-1)).toContain("world,");
  } finally {
    await context.close();
    server.close();
  }
});

test("a centred Quick Ask card stays put on a scrolled page when it changes state", async () => {
  const TALL = `<!doctype html><html><body>
    <div style="height:3000px">Top</div>
  </body></html>`;
  const { server, port } = await serveFixtureHtml(TALL);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGeminiCounted(context, { delayMs: 1500, reply: () => "ANSWER" });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.evaluate(() => window.scrollTo(0, 900));
    await sendToTab(sw, port, { type: "SHOW_QUICK_ASK_OVERLAY" });
    await waitShadow(page, "#omniAiInlineInput");
    // The card's box once every animation on it has finished.
    const settledBox = async () => {
      await page.waitForFunction(() => {
        const card = document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-overlay");
        // The skeleton shimmer loops forever and a finished fill stays
        // listed: only finite animations still running count.
        return (
          card &&
          card
            .getAnimations({ subtree: true })
            .every(
              (a) => a.playState !== "running" || a.effect.getComputedTiming().endTime === Infinity,
            )
        );
      });
      return page.evaluate(() => {
        const r = document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-overlay")
          .getBoundingClientRect();
        return { top: r.top, left: r.left };
      });
    };
    const asked = await settledBox();
    // Centred in the viewport, not somewhere in the scrolled document.
    expect(asked.top).toBeGreaterThan(0);
    expect(asked.top).toBeLessThan(await page.evaluate(() => window.innerHeight));

    await page.keyboard.type("What is this?");
    await page.keyboard.press("Enter");
    await waitShadow(page, ".omni-ai-skeleton");
    const loading = await settledBox();
    expect(Math.abs(loading.top - asked.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(loading.left - asked.left)).toBeLessThanOrEqual(2);

    await waitResultText(page, "ANSWER");
    const result = await settledBox();
    expect(Math.abs(result.top - asked.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(result.left - asked.left)).toBeLessThanOrEqual(2);
  } finally {
    await context.close();
    server.close();
  }
});
