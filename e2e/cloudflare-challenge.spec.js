const { test, expect } = require("@playwright/test");
const { launchWithExtension, serveFixtureHtml } = require("./extension.fixtures");

// Cloudflare's Turnstile widget runs in a challenges.cloudflare.com frame.
// The content script must stay out of it: Omni AI has nothing to do there,
// and anything it adds to that document can upset the challenge. The control
// frame on another origin proves the check would see an injected script.

const FRAME_DOC = `<!doctype html><html><body><p>frame</p></body></html>`;

const FIXTURE = `<!doctype html><html><body>
<iframe id="cf" src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/turnstile"></iframe>
<iframe id="other" src="https://widgets.example.test/frame"></iframe>
</body></html>`;

test("the content script does not run in a Cloudflare challenge frame", async () => {
  const { context } = await launchWithExtension();
  const { server, port } = await serveFixtureHtml(FIXTURE);
  try {
    await context.route(
      /^https:\/\/(challenges\.cloudflare\.com|widgets\.example\.test)\//,
      (route) => route.fulfill({ status: 200, contentType: "text/html", body: FRAME_DOC }),
    );
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    const frameOf = (host) => page.frames().find((f) => f.url().startsWith(`https://${host}/`));
    const hasHost = (frame) =>
      frame.evaluate(() => Boolean(document.getElementById("omni-ai-shadow-host")));

    await expect.poll(() => Boolean(frameOf("widgets.example.test"))).toBe(true);
    await expect.poll(() => hasHost(frameOf("widgets.example.test"))).toBe(true);

    const cf = frameOf("challenges.cloudflare.com");
    expect(cf).toBeTruthy();
    expect(await hasHost(cf)).toBe(false);
  } finally {
    await context.close();
    server.close();
  }
});
