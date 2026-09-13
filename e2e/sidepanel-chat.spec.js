const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

test("sidebar chat tab renders and sends a message", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    // Chat tab is present and active by default
    await expect(page.locator("#tabChat")).toBeVisible();
    await expect(page.locator("#chatView")).toBeVisible();
    await expect(page.locator("#toolsView")).toBeHidden();

    // The chat input's placeholder must be localized, not left as the raw
    // __MSG_ key -- localizeDOM()'s attribute walk previously only covered
    // title/alt, silently skipping placeholder.
    await expect(page.locator("#chatInput")).not.toHaveAttribute("placeholder", /__MSG_/);

    // Switch to tools then back to chat
    await page.locator("#tabTools").click();
    await expect(page.locator("#toolsView")).toBeVisible();
    await expect(page.locator("#chatView")).toBeHidden();
    await page.locator("#tabChat").click();
    await expect(page.locator("#chatView")).toBeVisible();

    // Send a message (SW streaming is stubbed via CDP routing if available,
    // otherwise the UI should at least append the user bubble + assistant bubble)
    await expect(page.locator("#chatEmpty")).toBeVisible();
    await page.locator("#chatInput").fill("Hello from the test");
    await page.locator("#chatSend").click();

    await expect(page.locator(".chat-msg.user").first()).toHaveText("Hello from the test");
    // assistant bubble should appear
    await expect(page.locator(".chat-msg.assistant").first()).toBeVisible();
    // The "start a conversation" hint must disappear once a message is sent
    // -- addChatMessage() adds the "hidden" class, but there was no
    // .chat-empty.hidden CSS rule to actually hide it.
    await expect(page.locator("#chatEmpty")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("chatSend is vertically centered on the input's true height, not the textarea's inline-block box (with its phantom descender gap)", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await context.newPage();
    const extId = new URL(sw.url()).host;
    await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    const { wrapHeight, inputHeight, sendCenterY, inputCenterY } = await page.evaluate(() => {
      const wrap = document.querySelector(".chat-input-wrap").getBoundingClientRect();
      const input = document.getElementById("chatInput").getBoundingClientRect();
      const send = document.getElementById("chatSend").getBoundingClientRect();
      return {
        wrapHeight: wrap.height,
        inputHeight: input.height,
        sendCenterY: send.top + send.height / 2,
        inputCenterY: input.top + input.height / 2,
      };
    });

    // A <textarea> defaults to display:inline-block, which reserves a few
    // extra pixels below it for the inline-formatting-context baseline (the
    // same "phantom gap" as an inline <img>). .chat-input-wrap wasn't
    // collapsing to the textarea's own height, so #chatSend -- centered on
    // the wrap -- sat a few px below the textarea's true center.
    expect(wrapHeight).toBeCloseTo(inputHeight, 0);
    expect(sendCenterY).toBeCloseTo(inputCenterY, 0);
  } finally {
    await context.close();
  }
});

test("page context stays current across tab switches without any manual interaction", async () => {
  const FIXTURE_A = `<!doctype html><html><head><title>Fixture Page A</title></head><body>
    <p>Content describing apples for the first fixture page.</p>
  </body></html>`;
  const FIXTURE_B = `<!doctype html><html><head><title>Fixture Page B</title></head><body>
    <p>Content describing oranges for the second fixture page.</p>
  </body></html>`;
  const { server: serverA, port: portA } = await serveFixtureHtml(FIXTURE_A);
  const { server: serverB, port: portB } = await serveFixtureHtml(FIXTURE_B);
  const { context, sw } = await launchWithExtension();
  try {
    const extId = new URL(sw.url()).host;

    // Open the panel FIRST -- Playwright models sidepanel.html as a regular
    // tab, so opening it after the fixture tab would itself steal "active"
    // status. bringToFront() below is what actually makes the fixture tab
    // the one chrome.tabs.query({active, currentWindow}) resolves to.
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);

    const pageA = await context.newPage();
    await pageA.goto(`http://127.0.0.1:${portA}/`);
    await pageA.bringToFront();

    // Chat is the default active tab -- page context must populate WITHOUT
    // clicking any tab button. Regression: refreshPageContext() was only
    // ever wired to the Chat tab-button's click handler, so the default
    // view never captured anything until the user manually switched tabs
    // away and back.
    await expect(panel.locator("#pageContextPreview")).toContainText("Fixture Page A");

    // Switching the active browser tab to a different page must refresh
    // the captured context WITHOUT any manual interaction with the panel.
    // Regression: nothing listened for chrome.tabs.onActivated/onUpdated,
    // so the panel silently kept showing whichever page was active the
    // last time a tab button was clicked.
    const pageB = await context.newPage();
    await pageB.goto(`http://127.0.0.1:${portB}/`);
    await pageB.bringToFront();
    await expect(panel.locator("#pageContextPreview")).toContainText("Fixture Page B");
  } finally {
    await context.close();
    serverA.close();
    serverB.close();
  }
});
