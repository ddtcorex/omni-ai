const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Covers iframe-mode rich text editors (TinyMCE classic, CKEditor 4, ...):
// the editable area is a srcdoc iframe whose own <body> is contenteditable,
// and the editor saves body.innerHTML. The content script runs inside that
// frame (all_frames + match_about_blank), so its shadow UI host must never
// land inside the editable body: it would be saved with the content, and a
// click on the overlay would make the host itself the replace target.

const EDITOR_DOC = `<!doctype html><html><body contenteditable="true">
<p>Alpha beta gamma delta epsilon.</p><p>Second paragraph stays.</p>
</body></html>`;

const FIXTURE = `<!doctype html><html><body>
<iframe id="editor" style="width:600px;height:300px" srcdoc="${EDITOR_DOC.replace(/"/g, "&quot;")}"></iframe>
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

async function openEditorFrame(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`);
  const frameEl = await page.waitForSelector("#editor");
  const frame = await frameEl.contentFrame();
  await frame.waitForSelector("p");
  return { frame, frameEl };
}

// Drag-selects the word "beta" (characters 6-10 of the first paragraph).
async function selectBeta(page, frame, frameEl) {
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
}

// Real mouse click on an element inside the frame's Omni AI shadow root.
async function clickShadow(frame, selector) {
  await frame.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
  const handle = await frame.evaluateHandle(
    (q) => document.getElementById("omni-ai-shadow-host").shadowRoot.querySelector(q),
    selector,
  );
  await handle.asElement().click();
}

test("the shadow UI host stays out of an editable iframe body", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    const { frame, frameEl } = await openEditorFrame(page, port);

    await selectBeta(page, frame, frameEl);
    await frame.waitForFunction(
      () =>
        document
          .getElementById("omni-ai-shadow-host")
          ?.shadowRoot?.querySelector(".omni-ai-quick-btn"),
      null,
      { timeout: 5000 },
    );

    const bodyHtml = await frame.evaluate(() => document.body.innerHTML);
    expect(bodyHtml).not.toContain("omni-ai-shadow-host");
  } finally {
    await context.close();
    server.close();
  }
});

test("Replace swaps the selected word inside an editable iframe body", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "BETA");
    const page = await context.newPage();
    const { frame, frameEl } = await openEditorFrame(page, port);

    await selectBeta(page, frame, frameEl);
    await clickShadow(frame, ".omni-ai-quick-btn");
    await clickShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
    await clickShadow(frame, "#omniAiReplace");

    await expect
      .poll(() => frame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim()))
      .toBe("Alpha BETA gamma delta epsilon. Second paragraph stays.");
  } finally {
    await context.close();
    server.close();
  }
});

// Counts the frame's Omni AI elements matching the selector.
function countShadow(frame, selector) {
  return frame.evaluate(
    (q) =>
      document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelectorAll(q).length ?? 0,
    selector,
  );
}

test("after Replace in an iframe editor no toolbar remains, and a new selection brings it back", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "BETA");
    const page = await context.newPage();
    const { frame, frameEl } = await openEditorFrame(page, port);

    await selectBeta(page, frame, frameEl);
    await clickShadow(frame, ".omni-ai-quick-btn");
    await clickShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
    await clickShadow(frame, "#omniAiReplace");

    await expect
      .poll(() => frame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim()))
      .toBe("Alpha BETA gamma delta epsilon. Second paragraph stays.");
    // The card's exit finishes, then its close re-syncs the toolbar.
    await expect.poll(() => countShadow(frame, ".omni-ai-overlay")).toBe(0);
    expect(await frame.evaluate(() => window.getSelection().isCollapsed)).toBe(true);
    // Any toolbar the close or the click's mouseup brings back is in by the
    // time the next frame has painted twice.
    await frame.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    expect(await countShadow(frame, ".omni-ai-quick-btn")).toBe(0);

    // A real new selection still shows the toolbar.
    await selectBeta(page, frame, frameEl);
    await expect.poll(() => countShadow(frame, ".omni-ai-quick-btn")).toBe(1);
  } finally {
    await context.close();
    server.close();
  }
});

test("a worker retry inside an iframe editor answers that frame, not the top one", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "RETRIED");
    const page = await context.newPage();
    const { frame, frameEl } = await openEditorFrame(page, port);

    // Focusing the editor records its frame as the active editor frame.
    await selectBeta(page, frame, frameEl);
    const frameId = await sw.evaluate(async (p) => {
      const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${p}/*` });
      const key = `omni_ai_active_frame_${tab.id}`;
      for (let i = 0; i < 50; i++) {
        const stored = (await chrome.storage.session.get(key))[key];
        if (Number.isInteger(stored) && stored !== 0) return stored;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    }, port);
    expect(frameId).not.toBeNull();

    // A worker error lands in the iframe card, as a keyboard command's would.
    await sw.evaluate(
      async ({ p, frameId }) => {
        const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${p}/*` });
        await chrome.tabs.sendMessage(
          tab.id,
          {
            type: "SHOW_RESULT",
            payload: {
              action: "rephrase",
              originalText: "beta",
              result: "Error: boom",
              error: true,
              isInput: true,
            },
          },
          { frameId },
        );
      },
      { p: port, frameId },
    );

    // A real click focuses the retry button inside the frame's shadow UI.
    await clickShadow(frame, "#omniAiRetry");

    await expect
      .poll(() =>
        frame.evaluate(
          () =>
            document
              .getElementById("omni-ai-shadow-host")
              ?.shadowRoot?.querySelector(".omni-ai-result-text")?.textContent ?? null,
        ),
      )
      .toBe("RETRIED");
    // Focus inside the extension's own UI is not an editor blur: keyboard
    // commands still route to the iframe editor afterwards.
    const storedFrame = await sw.evaluate(async (p) => {
      const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${p}/*` });
      const key = `omni_ai_active_frame_${tab.id}`;
      return (await chrome.storage.session.get(key))[key] ?? null;
    }, port);
    expect(storedFrame).toBe(frameId);
    expect(
      await page.evaluate(
        () =>
          document
            .getElementById("omni-ai-shadow-host")
            ?.shadowRoot?.querySelectorAll(".omni-ai-overlay").length ?? 0,
      ),
    ).toBe(0);
  } finally {
    await context.close();
    server.close();
  }
});
