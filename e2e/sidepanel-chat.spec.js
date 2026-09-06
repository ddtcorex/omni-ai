const { test, expect } = require("@playwright/test");
const { launchWithExtension } = require("./extension.fixtures");

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

    // Switch to tools then back to chat
    await page.locator("#tabTools").click();
    await expect(page.locator("#toolsView")).toBeVisible();
    await expect(page.locator("#chatView")).toBeHidden();
    await page.locator("#tabChat").click();
    await expect(page.locator("#chatView")).toBeVisible();

    // Send a message (SW streaming is stubbed via CDP routing if available,
    // otherwise the UI should at least append the user bubble + assistant bubble)
    await page.locator("#chatInput").fill("Hello from the test");
    await page.locator("#chatSend").click();

    await expect(page.locator(".chat-msg.user").first()).toHaveText("Hello from the test");
    // assistant bubble should appear
    await expect(page.locator(".chat-msg.assistant").first()).toBeVisible();
  } finally {
    await context.close();
  }
});
