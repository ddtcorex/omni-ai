const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Replace closes the card on every path that reaches it (spec follow-up A):
// a successful replace always closes the card, writes the text once, and a
// failed one keeps the card open with an inline message and Copy.

const FIXTURE = `<!doctype html><html><body style="min-height:2400px">
  <input id="inp" type="text" value="Hello world, this is a test." style="width:400px" />
  <textarea id="ta" rows="3" cols="40">Hello world, this is a test.</textarea>
  <div id="ce" contenteditable="true" style="width:400px;min-height:40px"><p>Hello world, this is a test.</p></div>
  <div id="rce" contenteditable="true" style="width:400px;min-height:40px"><p>Hello world, this is a test.</p></div>
  <input id="rinp" type="text" value="Hello world, this is a test." style="width:400px" />
  <script>
    // Framework-like editors: every input event re-renders the field. The
    // contenteditable rebuilds its children from its own text; the input is
    // replaced by a fresh node with the same id and value.
    document.getElementById("rce").addEventListener("input", (e) => {
      const el = e.currentTarget;
      const text = el.innerText;
      const p = document.createElement("p");
      p.textContent = text;
      el.replaceChildren(p);
    });
    const bindReactInput = (el) =>
      el.addEventListener("input", () => {
        const fresh = el.cloneNode();
        fresh.value = el.value;
        bindReactInput(fresh);
        el.replaceWith(fresh);
      });
    bindReactInput(document.getElementById("rinp"));
  </script>
</body></html>`;

const EDITOR_DOC = `<!doctype html><html><body contenteditable="true">
<p>Alpha beta gamma delta epsilon.</p><p>Second paragraph stays.</p>
</body></html>`;

const IFRAME_FIXTURE = `<!doctype html><html><body>
<iframe id="editor" style="width:600px;height:300px" srcdoc="${EDITOR_DOC.replace(/"/g, "&quot;")}"></iframe>
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
  }, flashActions);
}

function stubGemini(context, reply) {
  return context.route("**/generativelanguage.googleapis.com/**", (route) =>
    new URL(route.request().url()).pathname.endsWith("/models")
      ? route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            candidates: [
              { content: { parts: [{ text: typeof reply === "function" ? reply() : reply }] } },
            ],
          }),
        }),
  );
}

const inShadow = (target, selector) =>
  target.evaluate(
    (q) => !!document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
  );

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

// The result's Replace button is there and its text has landed.
async function waitForResult(target, text) {
  await target.waitForFunction(
    (t) => {
      const root = document.getElementById("omni-ai-shadow-host")?.shadowRoot;
      return (
        root?.querySelector("#omniAiReplace") &&
        root.querySelector(".omni-ai-result-text")?.textContent.includes(t)
      );
    },
    text,
    { timeout: 8000 },
  );
}

const cardCount = (target) =>
  target.evaluate(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelectorAll(".omni-ai-overlay").length ?? 0,
  );

// Select "world" (characters 6-11) in a field, the way a mouse selection
// would, and wait for the toolbar.
async function selectWorld(page, id) {
  await page.evaluate((fieldId) => {
    const el = document.getElementById(fieldId);
    el.focus();
    if ("setSelectionRange" in el) {
      el.setSelectionRange(6, 11);
    } else {
      const text = el.querySelector("p").firstChild;
      const range = document.createRange();
      range.setStart(text, 6);
      range.setEnd(text, 11);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  }, id);
  await page.locator(`#${id}`).dispatchEvent("mouseup");
  await page.waitForFunction(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-quick-btn"),
    null,
    { timeout: 5000 },
  );
}

async function runFromMenu(page, action = "rephrase") {
  await clickShadow(page, ".omni-ai-quick-btn");
  await clickShadow(page, `.omni-ai-menu-item[data-action="${action}"]`);
}

const fieldText = (page, id) =>
  page.evaluate((fieldId) => {
    const el = document.getElementById(fieldId);
    return "value" in el && el.tagName !== "DIV"
      ? el.value
      : el.innerText.replace(/\s+/g, " ").trim();
  }, id);

async function withPage(fixture, reply, body, flashActions) {
  const { server, port } = await serveFixtureHtml(fixture);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw, flashActions);
    await stubGemini(context, reply);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await body(page, { context, sw, port });
  } finally {
    await context.close();
    server.close();
  }
}

for (const id of ["inp", "ta", "ce", "rce", "rinp"]) {
  test(`Replace closes the card and writes the text in #${id}`, async () => {
    await withPage(FIXTURE, "WORLD", async (page) => {
      await selectWorld(page, id);
      await runFromMenu(page);
      await waitForResult(page, "WORLD");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => fieldText(page, id)).toBe("Hello WORLD, this is a test.");
      await expect.poll(() => cardCount(page)).toBe(0);
    });
  });
}

test("Replace with a multi-line result in a contenteditable closes the card and writes it once", async () => {
  await withPage(FIXTURE, "Line one.\nLine two.", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "Line two.");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => cardCount(page)).toBe(0);
    expect(await fieldText(page, "ce")).toBe("Hello Line one. Line two., this is a test.");
  });
});

test("Replace with repeated spaces in a contenteditable closes the card and writes it once", async () => {
  await withPage(FIXTURE, "W  O  R  L  D", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "W  O");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => cardCount(page)).toBe(0);
    expect(await fieldText(page, "ce")).toBe("Hello W O R L D, this is a test.");
  });
});

test("Replace with a result equal to the selection does not duplicate it", async () => {
  await withPage(FIXTURE, "world", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "world");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => cardCount(page)).toBe(0);
    expect(await fieldText(page, "ce")).toBe("Hello world, this is a test.");
  });
});

test("Replace with a multi-line result in an iframe editor closes the card and writes it once", async () => {
  await withPage(IFRAME_FIXTURE, "Line one.\nLine two.", async (page) => {
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
    await clickShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitForResult(frame, "Line two.");
    await clickShadow(frame, "#omniAiReplace");
    await expect.poll(() => cardCount(frame)).toBe(0);
    expect(await frame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim())).toBe(
      "Alpha Line one. Line two. gamma delta epsilon. Second paragraph stays.",
    );
  });
});

test("Replace after Back and a second action closes the card", async () => {
  await withPage(FIXTURE, "WORLD", async (page) => {
    await selectWorld(page, "ta");
    await runFromMenu(page);
    await waitForResult(page, "WORLD");
    await clickShadow(page, "#omniAiBack");
    await clickShadow(page, '.omni-ai-menu-item[data-action="grammar"]');
    await waitForResult(page, "WORLD");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ta")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("Replace after retry closes the card", async () => {
  let n = 0;
  await withPage(
    FIXTURE,
    () => `WORLD${++n}`,
    async (page) => {
      await selectWorld(page, "ce");
      await runFromMenu(page);
      await waitForResult(page, "WORLD1");
      await clickShadow(page, "#omniAiRetry");
      await waitForResult(page, "WORLD2");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD2, this is a test.");
      await expect.poll(() => cardCount(page)).toBe(0);
    },
  );
});

test("Replace after a tone switch closes the card", async () => {
  let n = 0;
  await withPage(
    FIXTURE,
    () => `TONE${++n}`,
    async (page) => {
      await selectWorld(page, "inp");
      await runFromMenu(page, "tone");
      await waitForResult(page, "TONE1");
      await clickShadow(page, '.omni-ai-tone-pill[data-tone="casual"]');
      await waitForResult(page, "TONE2");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => fieldText(page, "inp")).toBe("Hello TONE2, this is a test.");
      await expect.poll(() => cardCount(page)).toBe(0);
    },
  );
});

test("Replace after Show changes closes the card", async () => {
  await withPage(FIXTURE, "WORLD", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "WORLD");
    await clickShadow(page, "#omniAiShowChanges");
    await page.waitForTimeout(500);
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("Replace from a flash action closes the card", async () => {
  await withPage(
    FIXTURE,
    "WORLD",
    async (page) => {
      await selectWorld(page, "ce");
      const btn = await page.evaluateHandle(() =>
        document
          .getElementById("omni-ai-shadow-host")
          .shadowRoot.querySelector(".omni-ai-quick-btn"),
      );
      await btn.asElement().hover();
      await clickShadow(page, '[data-flash-action="rephrase"]');
      await waitForResult(page, "WORLD");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
      await expect.poll(() => cardCount(page)).toBe(0);
    },
    ["rephrase"],
  );
});

test("Replace on a keyboard-command result closes the card", async () => {
  await withPage(FIXTURE, "unused", async (page, { sw, port }) => {
    await selectWorld(page, "ce");
    const send = (message) =>
      sw.evaluate(
        async ({ port, message }) => {
          const tabs = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
          await chrome.tabs.sendMessage(tabs[0].id, message, { frameId: 0 });
        },
        { port, message },
      );
    await send({ type: "PROCESSING_START", action: "rephrase" });
    await send({
      type: "SHOW_RESULT",
      payload: { action: "rephrase", result: "WORLD", originalText: "world", isInput: true },
    });
    await waitForResult(page, "WORLD");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("Replace on a Quick Ask answer closes the card", async () => {
  await withPage(FIXTURE, "ANSWER", async (page) => {
    await selectWorld(page, "ta");
    await clickShadow(page, ".omni-ai-quick-btn");
    await clickShadow(page, "#omniAiInlineInput");
    await page.keyboard.type("Shout it");
    await page.keyboard.press("Enter");
    await waitForResult(page, "ANSWER");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ta")).toBe("Hello ANSWER, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("Replace after the page scrolled closes the card", async () => {
  await withPage(FIXTURE, "WORLD", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "WORLD");
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(200);
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

for (const id of ["inp", "ce"]) {
  test(`clicking Replace twice quickly writes the text once in #${id}`, async () => {
    await withPage(FIXTURE, "WORLD", async (page) => {
      await selectWorld(page, id);
      await runFromMenu(page);
      await waitForResult(page, "WORLD");
      const handle = await page.evaluateHandle(() =>
        document.getElementById("omni-ai-shadow-host").shadowRoot.querySelector("#omniAiReplace"),
      );
      await handle.asElement().click();
      await handle
        .asElement()
        .click({ force: true })
        .catch(() => {});
      await expect.poll(() => cardCount(page)).toBe(0);
      expect(await fieldText(page, id)).toBe("Hello WORLD, this is a test.");
    });
  });
}

test("Enter on the focused Replace button replaces and closes the card", async () => {
  await withPage(FIXTURE, "WORLD", async (page) => {
    await selectWorld(page, "ce");
    await runFromMenu(page);
    await waitForResult(page, "WORLD");
    await page.evaluate(() =>
      document
        .getElementById("omni-ai-shadow-host")
        .shadowRoot.querySelector("#omniAiReplace")
        .focus(),
    );
    await page.keyboard.press("Enter");
    await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("a failed Replace keeps the card open with an inline message and Copy", async () => {
  await withPage(FIXTURE, "WORLD", async (page) => {
    await selectWorld(page, "ta");
    await runFromMenu(page);
    await waitForResult(page, "WORLD");
    // The field is gone and nothing shares its id: there is nothing to write to.
    await page.evaluate(() => {
      const ta = document.getElementById("ta");
      ta.removeAttribute("id");
      ta.remove();
    });
    await clickShadow(page, "#omniAiReplace");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getElementById("omni-ai-shadow-host")
              ?.shadowRoot?.querySelector(".omni-ai-replace-failed")?.textContent ?? null,
        ),
      )
      .toContain("Couldn't replace the text");
    expect(await cardCount(page)).toBe(1);
    expect(await inShadow(page, "#omniAiCopy")).toBe(true);
  });
});

// Typing over the selection while the card is open removes the text the
// result was for: Replace must not fall back to the whole field.
for (const id of ["ta", "ce"]) {
  test(`Replace after the selection was typed over fails instead of replacing all of #${id}`, async () => {
    await withPage(FIXTURE, "WORLD", async (page) => {
      await selectWorld(page, id);
      await runFromMenu(page);
      await waitForResult(page, "WORLD");
      await page.evaluate((fieldId) => document.getElementById(fieldId).focus(), id);
      await page.keyboard.type("X");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => inShadow(page, ".omni-ai-replace-failed")).toBe(true);
      expect(await fieldText(page, id)).toBe("Hello X, this is a test.");
      expect(await cardCount(page)).toBe(1);
    });
  });
}

// Selecting other text while the card is open: the result was made for
// "world", so Replace must not write it over the new selection.
for (const id of ["ta", "ce"]) {
  test(`Replace after other text was selected fails instead of writing over it in #${id}`, async () => {
    await withPage(FIXTURE, "WORLD", async (page) => {
      await selectWorld(page, id);
      await runFromMenu(page);
      await waitForResult(page, "WORLD");
      await page.evaluate((fieldId) => {
        const el = document.getElementById(fieldId);
        if (el.setSelectionRange) {
          el.setSelectionRange(23, 27);
          return;
        }
        const text = el.querySelector("p").firstChild;
        getSelection().setBaseAndExtent(text, 23, text, 27);
      }, id);
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => inShadow(page, ".omni-ai-replace-failed")).toBe(true);
      expect(await fieldText(page, id)).toBe("Hello world, this is a test.");
      expect(await cardCount(page)).toBe(1);
    });
  });
}

// A keyboard command on the whole field (no selection), delivered the way
// the worker does: PROCESSING_START, then SHOW_RESULT with the field's text.
async function sendWorkerResult(sw, port, result, originalText, frameId = 0) {
  await sw.evaluate(
    async ({ port, result, originalText, frameId }) => {
      const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${port}/*` });
      await chrome.tabs.sendMessage(
        tab.id,
        { type: "PROCESSING_START", action: "rephrase" },
        { frameId },
      );
      await chrome.tabs.sendMessage(
        tab.id,
        {
          type: "SHOW_RESULT",
          payload: { action: "rephrase", result, originalText, isInput: true },
        },
        { frameId },
      );
    },
    { port, result, originalText, frameId },
  );
}

async function iframeEditor(page) {
  const frameEl = await page.waitForSelector("#editor");
  const frame = await frameEl.contentFrame();
  await frame.waitForSelector("p");
  return { frame, frameEl };
}

// The frame id the worker would route a keyboard command to.
async function activeFrameId(sw, port) {
  return sw.evaluate(async (p) => {
    const [tab] = await chrome.tabs.query({ url: `http://127.0.0.1:${p}/*` });
    const key = `omni_ai_active_frame_${tab.id}`;
    for (let i = 0; i < 50; i++) {
      const stored = (await chrome.storage.session.get(key))[key];
      if (Number.isInteger(stored) && stored !== 0) return stored;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }, port);
}

// Drag-select characters [start, end) of the frame's first paragraph.
async function dragInFrame(page, frame, frameEl, start, end) {
  const word = await frame.evaluate(
    ([s, e]) => {
      const text = document.querySelector("p").firstChild;
      const range = document.createRange();
      range.setStart(text, s);
      range.setEnd(text, e);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    [start, end],
  );
  const box = await frameEl.boundingBox();
  await page.mouse.move(box.x + word.x + 1, box.y + word.y + word.h / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + word.x + word.w - 1, box.y + word.y + word.h / 2, { steps: 6 });
  await page.mouse.up();
}

const frameText = (frame) =>
  frame.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());

test("a whole-field keyboard command after a typed-over selection replaces the field in a contenteditable", async () => {
  await withPage(FIXTURE, "unused", async (page, { sw, port }) => {
    await selectWorld(page, "ce");
    await page.keyboard.type("X");
    const text = await fieldText(page, "ce");
    expect(text).toBe("Hello X, this is a test.");
    await sendWorkerResult(sw, port, "REWRITTEN", text);
    await waitForResult(page, "REWRITTEN");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ce")).toBe("REWRITTEN");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});

test("a whole-field result in a contenteditable edited while the card is open fails instead of replacing it", async () => {
  await withPage(FIXTURE, "unused", async (page, { sw, port }) => {
    await page.evaluate(() => {
      const el = document.getElementById("ce");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.locator("#ce").dispatchEvent("mouseup");
    const text = await fieldText(page, "ce");
    await sendWorkerResult(sw, port, "REWRITTEN", text);
    await waitForResult(page, "REWRITTEN");
    await page.keyboard.type(" More");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => inShadow(page, ".omni-ai-replace-failed")).toBe(true);
    expect(await fieldText(page, "ce")).toBe("Hello world, this is a test. More");
    expect(await cardCount(page)).toBe(1);
  });
});

test("a whole-field keyboard command after a typed-over selection replaces the field in an iframe editor", async () => {
  await withPage(IFRAME_FIXTURE, "unused", async (page, { sw, port }) => {
    const { frame, frameEl } = await iframeEditor(page);
    await dragInFrame(page, frame, frameEl, 6, 10);
    await page.keyboard.type("X");
    const text = await frameText(frame);
    expect(text).toBe("Alpha X gamma delta epsilon. Second paragraph stays.");
    const frameId = await activeFrameId(sw, port);
    await sendWorkerResult(sw, port, "REWRITTEN", text, frameId);
    await waitForResult(frame, "REWRITTEN");
    await clickShadow(frame, "#omniAiReplace");
    await expect.poll(() => frameText(frame)).toBe("REWRITTEN");
    await expect.poll(() => cardCount(frame)).toBe(0);
  });
});

test("a whole-field result in an iframe editor edited while the card is open fails instead of replacing it", async () => {
  await withPage(IFRAME_FIXTURE, "unused", async (page, { sw, port }) => {
    const { frame, frameEl } = await iframeEditor(page);
    // "beta" is selected and captured with the toolbar, then the caret moves
    // to the end of the line: whole-field mode.
    await dragInFrame(page, frame, frameEl, 6, 10);
    await waitToolbar(frame);
    await page.keyboard.press("End");
    const text = await frameText(frame);
    const frameId = await activeFrameId(sw, port);
    await sendWorkerResult(sw, port, "REWRITTEN", text, frameId);
    await waitForResult(frame, "REWRITTEN");
    await page.keyboard.type(" More");
    await clickShadow(frame, "#omniAiReplace");
    await expect.poll(() => inShadow(frame, ".omni-ai-replace-failed")).toBe(true);
    expect(await frameText(frame)).toBe(
      "Alpha beta gamma delta epsilon. More Second paragraph stays.",
    );
    expect(await cardCount(frame)).toBe(1);
  });
});

// The toolbar is up: the selection it was drawn for has been captured.
async function waitToolbar(target) {
  await target.waitForFunction(
    () =>
      document
        .getElementById("omni-ai-shadow-host")
        ?.shadowRoot?.querySelector(".omni-ai-quick-btn"),
    null,
    { timeout: 5000 },
  );
}

// A word is selected (and captured), then a caret key moves away from it
// and a keyboard command runs on the whole field: Replace writes the whole
// field, not the old word.
for (const key of ["End", "Home", "ArrowRight"]) {
  test(`a whole-field result after ${key} moved off a captured selection replaces the whole contenteditable`, async () => {
    await withPage(FIXTURE, "unused", async (page, { sw, port }) => {
      await selectWorld(page, "ce");
      await page.keyboard.press(key);
      const text = await fieldText(page, "ce");
      await sendWorkerResult(sw, port, "REWRITTEN", text);
      await waitForResult(page, "REWRITTEN");
      await clickShadow(page, "#omniAiReplace");
      await expect.poll(() => fieldText(page, "ce")).toBe("REWRITTEN");
      await expect.poll(() => cardCount(page)).toBe(0);
    });
  });

  test(`a whole-field result after ${key} moved off a captured selection replaces the whole iframe editor`, async () => {
    await withPage(IFRAME_FIXTURE, "unused", async (page, { sw, port }) => {
      const { frame, frameEl } = await iframeEditor(page);
      await dragInFrame(page, frame, frameEl, 6, 10);
      await waitToolbar(frame);
      await page.keyboard.press(key);
      const text = await frameText(frame);
      const frameId = await activeFrameId(sw, port);
      await sendWorkerResult(sw, port, "REWRITTEN", text, frameId);
      await waitForResult(frame, "REWRITTEN");
      await clickShadow(frame, "#omniAiReplace");
      await expect.poll(() => frameText(frame)).toBe("REWRITTEN");
      await expect.poll(() => cardCount(frame)).toBe(0);
    });
  });
}

// Editors (ProseMirror, Lexical, Slate) re-set the DOM selection to an
// equivalent range with other boundary nodes. That is the same selection:
// Replace writes over it, never over the whole editor.
test("Replace after the editor re-set an equivalent selection writes over that selection only", async () => {
  const html = `<!doctype html><html><body><div id="ce" contenteditable="true" style="width:400px"><p>Hello <b>world</b>, this is a test.</p></div></body></html>`;
  await withPage(html, "WORLD", async (page) => {
    await page.evaluate(() => {
      const el = document.getElementById("ce");
      el.focus();
      const text = el.querySelector("b").firstChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 5);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.locator("#ce").dispatchEvent("mouseup");
    await waitToolbar(page);
    // Same text selected, element boundaries instead of text boundaries.
    await page.evaluate(() => {
      const b = document.querySelector("b");
      getSelection().setBaseAndExtent(b, 0, b, 1);
    });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    expect(await page.evaluate(() => getSelection().toString())).toBe("world");
    await clickShadow(page, ".omni-ai-quick-btn");
    await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await waitForResult(page, "WORLD");
    await clickShadow(page, "#omniAiReplace");
    await expect.poll(() => fieldText(page, "ce")).toBe("Hello WORLD, this is a test.");
    await expect.poll(() => cardCount(page)).toBe(0);
  });
});
