const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// With only a caret in a document editor (several blocks), Omni works on the
// block the caret is in: it selects that block when an action starts, and
// Replace leaves every other block and its formatting alone. A single-block
// field keeps the whole-field behaviour.

const FIXTURE = `<!doctype html><html><body style="font-family:sans-serif">
  <div id="doc" contenteditable="true" style="width:520px;border:1px solid #ccc;padding:8px">
    <h2>Weekly notes</h2>
    <p>First paragraph with <b>bold</b> text.</p>
    <ul><li><p>I has went to the store.</p></li></ul>
    <p>Last paragraph stays.</p>
  </div>
  <div id="one" contenteditable="true" style="width:520px;border:1px solid #ccc;padding:8px;margin-top:20px">
    <p>I has went to the store.</p>
  </div>
</body></html>`;

async function seedConfig(sw, flashActions = []) {
  await sw.evaluate(async (actions) => {
    for (let i = 0; i < 100; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      apiProvider: "google",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: actions },
    });
  }, flashActions);
}

function stubGemini(context, reply) {
  return context.route("**/generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] } }] }),
    }),
  );
}

async function clickShadow(page, selector) {
  await page.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
  const handle = await page.evaluateHandle(
    (q) => document.getElementById("omni-ai-shadow-host").shadowRoot.querySelector(q),
    selector,
  );
  await handle.asElement().click();
}

// A click into the text, the way a user places the caret.
async function placeCaret(page, selector) {
  await page.locator(selector).click({ position: { x: 20, y: 6 } });
  await page.waitForFunction(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-quick-btn"),
    null,
    { timeout: 5000 },
  );
}

const html = (page, id) =>
  page.evaluate((i) => document.getElementById(i).innerHTML.replace(/\s+/g, " ").trim(), id);

async function withPage(body, flashActions) {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, flashActions);
    await stubGemini(context, "I went to the store.");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await body(page, { sw, port });
  } finally {
    await context.close();
    server.close();
  }
}

test("a caret in a list item rewrites that item only", async () => {
  await withPage(async (page) => {
    await placeCaret(page, "#doc li p");
    await clickShadow(page, ".omni-ai-quick-btn");
    // Opening the menu shows the block the action will cover.
    await expect
      .poll(() => page.evaluate(() => getSelection().toString()))
      .toBe("I has went to the store.");
    await clickShadow(page, '.omni-ai-menu-item[data-action="grammar"]');
    await clickShadow(page, "#omniAiReplace");

    await expect
      .poll(() => html(page, "doc"))
      .toBe(
        "<h2>Weekly notes</h2> <p>First paragraph with <b>bold</b> text.</p> " +
          "<ul><li><p>I went to the store.</p></li></ul> <p>Last paragraph stays.</p>",
      );
  });
});

test("a flash action on a caret also covers just its block", async () => {
  await withPage(
    async (page) => {
      await placeCaret(page, "#doc li p");
      await page.evaluate(() => {
        const btn = document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-quick-btn");
        btn.dispatchEvent(new MouseEvent("mouseenter"));
      });
      await clickShadow(page, '[data-flash-action="grammar"]');
      await clickShadow(page, "#omniAiReplace");

      await expect.poll(() => html(page, "doc")).toContain("<li><p>I went to the store.</p></li>");
      await expect.poll(() => html(page, "doc")).toContain("<b>bold</b>");
      await expect.poll(() => html(page, "doc")).toContain("<h2>Weekly notes</h2>");
    },
    ["grammar"],
  );
});

test("a caret in a single-paragraph field still rewrites the whole field", async () => {
  await withPage(async (page) => {
    await placeCaret(page, "#one p");
    await clickShadow(page, ".omni-ai-quick-btn");
    await clickShadow(page, '.omni-ai-menu-item[data-action="grammar"]');
    await clickShadow(page, "#omniAiReplace");

    await expect
      .poll(() => page.evaluate(() => document.getElementById("one").innerText.trim()))
      .toBe("I went to the store.");
  });
});

// A worker run (keyboard command, context menu) shows its result through
// PROCESSING_START and SHOW_RESULT. Neither starts an action, so neither may
// select the caret's block: the user's next keystroke would type over it.
async function sendWorkerResult(sw, port, result, originalText) {
  await sw.evaluate(
    async ({ port, result, originalText }) => {
      const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
      await chrome.tabs.sendMessage(tab.id, { type: "PROCESSING_START", action: "grammar" });
      await chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_RESULT",
        payload: { action: "grammar", result, originalText, isInput: true },
      });
    },
    { port, result, originalText },
  );
}

test("typing while a result is shown never types over the caret's block", async () => {
  await withPage(async (page, { sw, port }) => {
    await placeCaret(page, "#doc li p");
    await page.keyboard.press("End");
    await sendWorkerResult(sw, port, "I went to the store.", "I has went to the store.");
    await page.waitForFunction(
      () =>
        document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector("#omniAiReplace"),
      null,
      { timeout: 8000 },
    );

    expect(await page.evaluate(() => getSelection().toString())).toBe("");
    await page.keyboard.type(" More");

    await expect
      .poll(() => html(page, "doc"))
      .toBe(
        "<h2>Weekly notes</h2> <p>First paragraph with <b>bold</b> text.</p> " +
          "<ul><li><p>I has went to the store. More</p></li></ul> <p>Last paragraph stays.</p>",
      );
  });
});
