// Records docs/assets/ai-model-setup.gif, the README's AI model setup
// walkthrough, against stubbed providers: no real key or request is used.
// Usage: node scripts/record-setup-demo.cjs   (needs ffmpeg on PATH)
// Re-run it whenever the AI provider card in Settings changes.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const extRoot = path.resolve(__dirname, "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-setup-demo-"));
const gifPath = path.join(extRoot, "docs", "assets", "ai-model-setup.gif");
fs.mkdirSync(path.join(outDir, "video"), { recursive: true });
const { chromium } = require("@playwright/test");

// This script drives the packaged extension from outside, the way the e2e
// specs do, so it seeds chrome.storage directly; the Storage Map rule governs
// the extension's own source, not a recorder.
/* eslint-disable no-restricted-syntax */

const SIZE = { width: 900, height: 820 };
const OPENAI = [
  "gpt-5.7-nova",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.5",
  "gpt-5.5-mini",
  "o5-mini",
  "o4-mini",
  "gpt-image-2",
  "gpt-4o-mini-tts",
  "gpt-realtime",
  "text-embedding-3-small",
];
const GATEWAY = [
  "qwen3.8-27b",
  "deepseek-v4",
  "claude-sonnet-5",
  "gemini-2.5-pro",
  "llama-5-70b",
  "mistral-large-3",
  ...Array.from(
    { length: 282 },
    (_, i) => `vendor-${String.fromCharCode(97 + (i % 26))}/model-${100 + i}`,
  ),
];
const calls = { openai: 0, gateway: 0, gemini: 0 };
let shot = 0;
const SNAPSHOTS = process.env.DEMO_SNAPSHOTS === "1";

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__demo_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__demo_caption";
      el.style.cssText =
        "position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;" +
        "max-width:900px;padding:10px 18px;border-radius:12px;background:rgba(20,16,40,.92);" +
        "color:#fff;font:600 15px/1.4 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3);text-align:center";
      document.documentElement.appendChild(el);
    }
    el.textContent = t;
  }, text);
}
async function snap(page, name) {
  shot += 1;
  if (!SNAPSHOTS) return;
  await page.screenshot({
    path: path.join(outDir, `${String(shot).padStart(2, "0")}-${name}.png`),
  });
}
const listOf = (ids) =>
  JSON.stringify({ data: ids.map((id, i) => ({ id, created: 1800000000 - i })) });

async function routes(context) {
  await context.route("**/generativelanguage.googleapis.com/**", (route) => {
    calls.gemini += 1;
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: 400, message: "API key not valid. Please pass a valid API key." },
      }),
    });
  });
  await context.route("**/api.openai.com/**", async (route) => {
    const url = new URL(route.request().url());
    await new Promise((r) => setTimeout(r, 700));
    if (url.pathname.endsWith("/models")) {
      calls.openai += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: listOf(OPENAI) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
    });
  });
  await context.route("**/gw.example.com/**", async (route) => {
    const url = new URL(route.request().url());
    await new Promise((r) => setTimeout(r, 700));
    if (url.pathname.endsWith("/models")) {
      calls.gateway += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: listOf(GATEWAY) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
    });
  });
}

const keyState = (page, state) =>
  page.waitForFunction((s) => document.getElementById("keyStatus")?.dataset.state === s, state, {
    timeout: 10000,
  });

(async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(outDir, "video"), size: SIZE },
    args: [`--disable-extensions-except=${extRoot}`, `--load-extension=${extRoot}`],
  });
  try {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    await sw.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const { currentPreset } = await chrome.storage.local.get("currentPreset");
        if (currentPreset) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await chrome.storage.sync.set({ omni_ai_theme: "light" });
    });
    await routes(context);
    const extId = new URL(sw.url()).host;
    const settingsUrl = `chrome-extension://${extId}/settings.html`;
    for (const p of context.pages()) await p.close();

    const page = await context.newPage();
    await page.goto(settingsUrl);
    await page.locator("#providerPicker [role=radio]").first().waitFor();
    await page.waitForTimeout(500);
    const card = page.locator("#providerPicker");

    // 1
    await card.scrollIntoViewIfNeeded();
    await caption(page, "1. Choose your AI provider");
    await page.waitForTimeout(1500);
    await page.locator('#providerPicker [data-provider="openai"]').click();
    await page.waitForTimeout(900);
    await snap(page, "provider");

    // 2
    await caption(page, "2. Paste your API key: leaving the field checks it and loads the models");
    await page.locator("#openaiApiKey").click();
    await page.locator("#openaiApiKey").pressSequentially("sk-demo-key-123", { delay: 35 });
    await page.keyboard.press("Tab");
    await keyState(page, "ok");
    await page.waitForTimeout(2200);
    await snap(page, "models");

    // 3
    await caption(page, "3. Pick a model, or type a name the list does not show");
    await page.waitForTimeout(800);
    await page.locator('#modelPicker [data-model="gpt-5.7-nova"]').click();
    await page.waitForTimeout(1600);
    await snap(page, "picked");

    // 4
    await caption(page, "4. Validate Configuration sends one test request");
    await page.locator("#validateBtn").scrollIntoViewIfNeeded();
    await page.locator("#validateBtn").click();
    await page.waitForFunction(() =>
      document.getElementById("validationStatus")?.classList.contains("ds-notice--success"),
    );
    await page.waitForTimeout(2000);
    await snap(page, "validated");

    // 5
    await caption(page, "5. Save Settings, and Omni AI is ready");
    await page.locator("#saveBtn").click();
    await page.waitForTimeout(2200);
    await snap(page, "saved");

    // 6
    await card.scrollIntoViewIfNeeded();
    await caption(
      page,
      "Custom Gateway: enter its base URL (the key is optional) to list its models",
    );
    await page.locator('#providerPicker [data-provider="customGateway"]').click();
    await page.locator("#customGatewayBaseUrl").click();
    await page
      .locator("#customGatewayBaseUrl")
      .pressSequentially("https://gw.example.com/v1", { delay: 25 });
    await page.keyboard.press("Tab");
    await keyState(page, "ok");
    await page.waitForTimeout(1200);
    await page.locator("#modelFilter").click();
    await page.locator("#modelFilter").pressSequentially("qwen", { delay: 90 });
    await page.locator('#modelPicker [data-model="qwen3.8-27b"]').click();
    await page.waitForTimeout(2200);
    await snap(page, "gateway");

    const video = page.video();
    await context.close();
    const raw = await video.path();
    const palette = path.join(outDir, "palette.png");
    // Trim the blank first page load, then a 256 colour palette with no
    // dither: the glass backdrop bands visibly under ordered dithering.
    const filters = "fps=10,scale=760:-1:flags=lanczos";
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "1.2",
      "-i",
      raw,
      "-vf",
      `${filters},palettegen=max_colors=256:stats_mode=diff`,
      palette,
    ]);
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "1.2",
      "-i",
      raw,
      "-i",
      palette,
      "-lavfi",
      `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
      gifPath,
    ]);
    console.log(`wrote ${path.relative(extRoot, gifPath)} (${fs.statSync(gifPath).size} bytes)`);
  } catch (e) {
    await context.close();
    throw e;
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
