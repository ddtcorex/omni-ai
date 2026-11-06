const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Apps that open a record as a modal <dialog> (showModal) put its editors in
// the browser's top layer and make the rest of the page inert. The Omni UI
// must live inside that dialog, or it is drawn under it and cannot be clicked.

const FIXTURE = `<!doctype html><html><body style="font-family:sans-serif">
  <p>Background page.</p>
  <dialog id="task" aria-label="Task" style="width:640px">
    <h3>Task detail</h3>
    <div id="ce" contenteditable="true" style="min-height:60px;border:1px solid #ccc;padding:8px">
      <p>Hello world, this is a test.</p><p>Second paragraph stays.</p>
    </div>
    <textarea id="ta" rows="3" cols="50">Hello world, this is a test.</textarea>
  </dialog>
  <script>document.getElementById("task").showModal();</script>
</body></html>`;

async function seedConfig(sw) {
  await sw.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await chrome.storage.local.set({
      apiModel: "gemini-3.6-flash",
      apiProvider: "google",
      geminiApiKey: "fake-key-for-e2e",
      settings: { showFloatingButton: true, flashActions: [] },
    });
  });
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

// A real pointer click on an element in the Omni shadow root: it only lands
// when the element is on top and not inert.
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
  await handle.asElement().click({ timeout: 4000 });
}

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
}

for (const id of ["ce", "ta"]) {
  test(`Omni works on #${id} inside a modal dialog`, async () => {
    const { server, port } = await serveFixtureHtml(FIXTURE);
    const { context, sw } = await launchWithExtension();
    try {
      await seedConfig(sw);
      await stubGemini(context, "WORLD");
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/`);
      await expect(page.locator("#task")).toHaveJSProperty("open", true);
      await selectWorld(page, id);

      // The UI is inside the modal, so it is drawn above it and not inert.
      await page.waitForFunction(
        () => !!document.getElementById("omni-ai-shadow-host")?.closest("dialog[open]"),
        null,
        { timeout: 5000 },
      );
      await clickShadow(page, ".omni-ai-quick-btn");
      await clickShadow(page, '.omni-ai-menu-item[data-action="rephrase"]');
      await clickShadow(page, "#omniAiReplace");

      await expect
        .poll(() =>
          page.evaluate((fieldId) => {
            const el = document.getElementById(fieldId);
            return el.tagName === "TEXTAREA" ? el.value : el.innerText.replace(/\s+/g, " ").trim();
          }, id),
        )
        .toContain("Hello WORLD, this is a test.");
      // Replacing does not close the dialog the user is working in.
      await expect(page.locator("#task")).toHaveJSProperty("open", true);
    } finally {
      await context.close();
      server.close();
    }
  });
}

test("Escape closes the Omni card, not the dialog it sits in", async () => {
  const { server, port } = await serveFixtureHtml(FIXTURE);
  const { context, sw } = await launchWithExtension();
  try {
    await seedConfig(sw);
    await stubGemini(context, "WORLD");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await selectWorld(page, "ce");
    await clickShadow(page, ".omni-ai-quick-btn");
    await page.waitForFunction(() =>
      document.getElementById("omni-ai-shadow-host")?.shadowRoot?.querySelector(".omni-ai-overlay"),
    );

    await page.keyboard.press("Escape");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document
              .getElementById("omni-ai-shadow-host")
              ?.shadowRoot?.querySelectorAll(".omni-ai-overlay").length ?? 0,
        ),
      )
      .toBe(0);
    await expect(page.locator("#task")).toHaveJSProperty("open", true);
  } finally {
    await context.close();
    server.close();
  }
});
