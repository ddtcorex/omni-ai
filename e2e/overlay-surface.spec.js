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
      /** @type {HTMLElement} */ (root.querySelector("#omniAiClose")).click();
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
  const BOTTOM_FIXTURE = `<!doctype html><html><body style="margin:0;height:3000px">
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
    await page.waitForTimeout(500);

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
