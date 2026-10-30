const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// In a rich text editor the floating toolbar sits on the selection's last
// line, right of its end: editors draw their own selection toolbar above or
// below the selection, never on its line. Inside a same-origin iframe editor
// the toolbar and the card also step clear of any parent-document element
// drawn over the frame (TinyMCE's quickbar lives in the parent, where the
// frame's UI cannot outrank it).

const PAGE_FIXTURE = `<!doctype html><html><body style="margin:40px">
<div id="ed" contenteditable="true" style="width:260px;font:16px/24px sans-serif">Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.</div>
</body></html>`;

const EDITOR_DOC = `<!doctype html><html><body contenteditable="true" style="margin:0;padding:60px 20px;font:16px/22px sans-serif">
<p>Alpha beta gamma delta epsilon.</p><p>Second paragraph stays.</p>
</body></html>`;

const FRAME_FIXTURE = `<!doctype html><html><body style="margin:20px">
<iframe id="editor" style="width:600px;height:460px;border:1px solid #888" srcdoc="${EDITOR_DOC.replace(/"/g, "&quot;")}"></iframe>
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

// Viewport rect of an element inside the target's Omni AI shadow root.
function shadowRect(target, selector) {
  return target.evaluate((q) => {
    const el = document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);
}

async function waitShadow(target, selector) {
  await target.waitForFunction(
    (q) => document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(q),
    selector,
    { timeout: 8000 },
  );
}

// Viewport rect of characters [start, end) of a text node.
function textRect(target, selector, start, end) {
  return target.evaluate(
    ({ selector, start, end }) => {
      const node = document.querySelector(selector).firstChild;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    { selector, start, end },
  );
}

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("in a rich text editor the toolbar sits right of the selection end on its last line", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const text = await page.evaluate(() => document.getElementById("ed").textContent);
    const from = await textRect(page, "#ed", text.indexOf("gamma"), text.indexOf("gamma") + 1);
    const toIndex = text.indexOf("theta") + "theta".length;
    const to = await textRect(page, "#ed", toIndex - 1, toIndex);
    expect(to.y).toBeGreaterThan(from.y); // the selection spans two lines

    await page.mouse.move(from.x + 1, from.y + from.h / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.w - 1, to.y + to.h / 2, { steps: 8 });
    await page.mouse.up();
    await waitShadow(page, ".omni-ai-quick-btn");

    const lines = await page.evaluate(() =>
      Array.from(window.getSelection().getRangeAt(0).getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
    );
    expect(lines.length).toBeGreaterThan(1);
    const last = lines[lines.length - 1];
    const btn = await shadowRect(page, ".omni-ai-quick-btn");
    const centreY = (btn.top + btn.bottom) / 2;
    expect(centreY).toBeGreaterThanOrEqual(last.top);
    expect(centreY).toBeLessThanOrEqual(last.bottom);
    expect(btn.left).toBeGreaterThanOrEqual(last.right);
    for (const line of lines) expect(overlaps(btn, line)).toBe(false);
  } finally {
    await context.close();
    server.close();
  }
});

test("in a rich text editor the card opens under the start of the selection's last line", async () => {
  const { server, port } = await serveFixtureHtml(PAGE_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const text = await page.evaluate(() => document.getElementById("ed").textContent);
    const from = await textRect(page, "#ed", text.indexOf("gamma"), text.indexOf("gamma") + 1);
    const toIndex = text.indexOf("theta") + "theta".length;
    const to = await textRect(page, "#ed", toIndex - 1, toIndex);
    await page.mouse.move(from.x + 1, from.y + from.h / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.w - 1, to.y + to.h / 2, { steps: 8 });
    await page.mouse.up();
    await waitShadow(page, ".omni-ai-quick-btn");

    const lines = await page.evaluate(() =>
      Array.from(window.getSelection().getRangeAt(0).getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
    );
    const last = lines[lines.length - 1];
    const lastLineLeft = Math.min(...lines.filter((r) => r.top >= last.top - 2).map((r) => r.left));

    const btn = await page.evaluateHandle(() =>
      document.getElementById("omni-ai-shadow-host").shadowRoot.querySelector(".omni-ai-quick-btn"),
    );
    await btn.asElement().click();
    await waitShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
    await page.waitForTimeout(600); // enter animation and reposition settle

    const card = await shadowRect(page, ".omni-ai-overlay");
    const btnRect = await shadowRect(page, ".omni-ai-quick-btn");
    // The ✦ stays at the selection end; the card starts under the last line.
    expect(btnRect.left).toBeGreaterThanOrEqual(last.right);
    expect(Math.abs(card.left - lastLineLeft)).toBeLessThanOrEqual(1);
    // Vertical rule unchanged: below the toolbar.
    expect(card.top).toBeGreaterThanOrEqual(btnRect.bottom);
  } finally {
    await context.close();
    server.close();
  }
});

async function openFrame(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`);
  const frameEl = await page.waitForSelector("#editor");
  const frame = await frameEl.contentFrame();
  await frame.waitForSelector("p");
  // Content box of the frame in the parent viewport (1px border).
  const box = await frameEl.boundingBox();
  return { frame, frameEl, origin: { x: box.x + 1, y: box.y + 1 } };
}

// Adds a parent-document bar drawn over the frame, the way an editor's
// selection toolbar (TinyMCE's quickbar) is.
function addHostBar(page, rect) {
  return page.evaluate((r) => {
    const bar = document.createElement("div");
    bar.id = "host-bar";
    bar.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:#333;z-index:10;`;
    document.body.appendChild(bar);
  }, rect);
}

async function dragSelect(page, origin, word) {
  await page.mouse.move(origin.x + word.x + 1, origin.y + word.y + word.h / 2);
  await page.mouse.down();
  await page.mouse.move(origin.x + word.x + word.w - 1, origin.y + word.y + word.h / 2, {
    steps: 6,
  });
  await page.mouse.up();
}

function topElementAt(page, x, y) {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el ? el.id || el.tagName : null;
    },
    [x, y],
  );
}

test("in an iframe editor the toolbar and the card stay clear of a host bar under the selection", async () => {
  const { server, port } = await serveFixtureHtml(FRAME_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    const { frame, origin } = await openFrame(page, port);
    const word = await textRect(frame, "p", 6, 10); // "beta"
    await addHostBar(page, {
      left: origin.x + word.x + word.w / 2 - 129,
      top: origin.y + word.y + word.h + 12,
      width: 258,
      height: 48,
    });

    await dragSelect(page, origin, word);
    await waitShadow(frame, ".omni-ai-quick-btn");
    const btn = await shadowRect(frame, ".omni-ai-quick-btn");
    const cx = origin.x + (btn.left + btn.right) / 2;
    const cy = origin.y + (btn.top + btn.bottom) / 2;
    expect(await topElementAt(page, cx, cy)).toBe("editor");

    await page.mouse.click(cx, cy);
    await waitShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
    // The card's position settles once its enter animation has started.
    await frame.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const card = await shadowRect(frame, ".omni-ai-overlay");
    for (const fx of [0.05, 0.5, 0.95]) {
      for (const dy of [2, 10, 19]) {
        const x = origin.x + card.left + (card.right - card.left) * fx;
        const y = origin.y + card.top + dy;
        expect(await topElementAt(page, x, y)).toBe("editor");
      }
    }
  } finally {
    await context.close();
    server.close();
  }
});

test("in an iframe editor the toolbar steps off a host bar drawn on the selection's line", async () => {
  const { server, port } = await serveFixtureHtml(FRAME_FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    const page = await context.newPage();
    const { frame, origin } = await openFrame(page, port);
    const word = await textRect(frame, "p", 6, 10); // "beta"
    await addHostBar(page, {
      left: origin.x + word.x + word.w + 1,
      top: origin.y + word.y - 6,
      width: 200,
      height: word.h + 12,
    });

    await dragSelect(page, origin, word);
    await waitShadow(frame, ".omni-ai-quick-btn");
    const btn = await shadowRect(frame, ".omni-ai-quick-btn");
    const cx = origin.x + (btn.left + btn.right) / 2;
    const cy = origin.y + (btn.top + btn.bottom) / 2;
    expect(await topElementAt(page, cx, cy)).toBe("editor");

    await page.mouse.click(cx, cy);
    await waitShadow(frame, '.omni-ai-menu-item[data-action="rephrase"]');
  } finally {
    await context.close();
    server.close();
  }
});
