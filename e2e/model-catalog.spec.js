const { test, expect } = require("@playwright/test");
const { launchWithExtension } = require("./extension.fixtures");

// The provider first model picker in the real extension: the worker lists a
// provider's models through a routed vendor endpoint, Settings renders them
// as buttons, and Save writes the keys the runtime reads.

const openaiList = (ids) => ({
  object: "list",
  data: ids.map((id, i) => ({ id, created: 2000 - i })),
});

async function openSettings(context, sw, seed = {}) {
  // Seed through the service worker: a fresh page has no chrome.* API until it
  // is an extension page. Wait for the install defaults first: they are a
  // read, merge and write, and a seed landing in between is overwritten.
  await sw.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const { currentPreset } = await chrome.storage.local.get("currentPreset");
      if (currentPreset) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
  await sw.evaluate((values) => chrome.storage.local.set(values), seed);
  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/settings.html`);
  await expect(page.locator("#providerPicker [role=radio]")).toHaveCount(5);
  return page;
}

const modelButtons = (page) => page.locator("#modelPicker [role=radio]");

test("provider first: a key blur lists the provider's models as buttons", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const listed = [];
    await context.route("https://api.openai.com/v1/models", (route) => {
      listed.push(route.request().headers().authorization);
      return route.fulfill({
        json: openaiList(["gpt-5.7-nova", "gpt-5.6-terra", "gpt-image-2", "o5-mini"]),
      });
    });
    const page = await openSettings(context, sw);

    await expect(page.locator("#modelHint")).not.toBeEmpty();
    await page.locator('#providerPicker [data-provider="openai"]').click();
    await page.fill("#openaiApiKey", "sk-e2e-key");
    await page.locator("#openaiApiKey").blur();

    await expect(page.locator("#keyStatus")).toHaveAttribute("data-state", "ok");
    expect(listed).toEqual(["Bearer sk-e2e-key"]);
    const ids = await modelButtons(page).evaluateAll((els) => els.map((el) => el.dataset.model));
    // The recommended model leads; the image model is filtered out.
    expect(ids[0]).toBe("gpt-5.6-terra");
    expect(ids).toContain("gpt-5.7-nova");
    expect(ids).not.toContain("gpt-image-2");
    await expect(page.locator("#modelHint")).toBeEmpty();
  } finally {
    await context.close();
  }
});

test("a 288 model gateway shows twelve buttons, More and a filter", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const ids = ["qwen3.8-27b", ...Array.from({ length: 287 }, (_, i) => `vendor/model-${i}`)];
    await context.route("https://gw.example.test/v1/models", (route) =>
      route.fulfill({ json: openaiList(ids) }),
    );
    const page = await openSettings(context, sw);
    await page.locator('#providerPicker [data-provider="customGateway"]').click();
    await page.fill("#customGatewayBaseUrl", "https://gw.example.test/v1");
    await page.locator("#customGatewayBaseUrl").blur();

    await expect(modelButtons(page)).toHaveCount(12);
    await expect(page.locator("#modelFilterRow")).toBeVisible();
    await page.locator("#modelMore").click();
    await expect(modelButtons(page)).toHaveCount(288);
    await page.locator("#modelMore").click();
    await page.fill("#modelFilter", "model-286");
    await expect(modelButtons(page)).toHaveCount(1);
    await expect(modelButtons(page).first()).toHaveAttribute("data-model", "vendor/model-286");
  } finally {
    await context.close();
  }
});

test("saving writes the provider beside the chosen model", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, {
      apiProvider: "openai",
      apiModel: "gpt-5.6-terra",
      openaiApiKey: "sk-test",
      modelCatalog: {
        openai: {
          fetchedAt: Date.now(),
          models: ["gpt-5.6-terra", "gpt-5.7-nova"].map((id) => ({
            id,
            label: id,
            createdAt: 1,
            state: "active",
            methods: null,
          })),
          truncated: false,
        },
      },
    });

    await page.locator('#modelPicker [data-model="gpt-5.7-nova"]').click();
    await page.click("#saveBtn");
    await expect(page.locator("#saveStatus")).toHaveClass(/ds-notice--success/);

    const stored = await page.evaluate(() => chrome.storage.local.get(["apiModel", "apiProvider"]));
    expect(stored).toEqual({ apiModel: "gpt-5.7-nova", apiProvider: "openai" });
  } finally {
    await context.close();
  }
});

test("a saved gateway custom name opens filled in, from the cache, with no request", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    let requests = 0;
    await context.route("https://gw.example.test/**", (route) => {
      requests += 1;
      return route.fulfill({ json: openaiList(["x"]) });
    });
    const models = ["qwen3.8-27b", "deepseek-v4"].map((id) => ({
      id,
      label: id,
      createdAt: 1,
      state: "active",
      methods: null,
    }));
    const page = await openSettings(context, sw, {
      apiProvider: "customGateway",
      apiModel: "custom-gateway",
      customGatewayModelName: "qwen3.8-27b",
      customGatewayBaseUrl: "https://gw.example.test/v1",
      modelCatalog: {
        customGateway: {
          fetchedAt: Date.now(),
          models,
          truncated: false,
          baseUrl: "https://gw.example.test/v1",
        },
      },
    });

    await expect(page.locator("#customModelName")).toHaveValue("qwen3.8-27b");
    await expect(modelButtons(page)).toHaveCount(2);
    await expect(page.locator('#modelPicker [aria-checked="true"]')).toHaveCount(0);
    expect(requests).toBe(0);
  } finally {
    await context.close();
  }
});

test("the provider row is one tab stop that arrow keys move through", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, {
      apiProvider: "google",
      apiModel: "gemini-3.6-flash",
    });
    await page.locator('#providerPicker [data-provider="google"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('#providerPicker [data-provider="openai"]')).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator('#providerPicker [data-provider="openai"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("#openaiKeyGroup")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a check result is not hidden under the floating save bar", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    await context.route("https://api.openai.com/v1/chat/completions", (route) =>
      route.fulfill({ json: { choices: [{ message: { content: "OK" } }] } }),
    );
    const page = await openSettings(context, sw, {
      apiProvider: "openai",
      apiModel: "gpt-5.7-nova",
      openaiApiKey: "sk-test",
      modelCatalog: {
        openai: {
          fetchedAt: Date.now(),
          models: [{ id: "gpt-5.7-nova", label: "gpt-5.7-nova", createdAt: 1, state: "active" }],
          truncated: false,
        },
      },
    });
    await page.setViewportSize({ width: 1000, height: 800 });
    // The sections slide in; measure once they have settled.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== "running" ||
            animation.effect?.getTiming().iterations === Infinity,
        ),
    );
    // Put the Validate button just above the bar, where the user clicks it.
    await page.evaluate(() => {
      const button = document.getElementById("validateBtn").getBoundingClientRect();
      const bar = document.querySelector(".save-actions").getBoundingClientRect();
      window.scrollBy(0, button.bottom - bar.top + 8);
    });
    await page.evaluate(() => document.getElementById("validateBtn").click());
    await expect(page.locator("#validationStatus")).toHaveClass(/ds-notice--success/);
    await page.waitForTimeout(600);

    const boxes = await page.evaluate(() => ({
      notice: document.getElementById("validationStatus").getBoundingClientRect().bottom,
      bar: document.querySelector(".save-actions").getBoundingClientRect().top,
    }));
    console.log(
      "DBG",
      JSON.stringify(boxes),
      await page.evaluate(() => [
        scrollY,
        document.documentElement.scrollHeight,
        innerHeight,
        document.getElementById("validateBtn").getBoundingClientRect().bottom,
      ]),
    );
    expect(boxes.notice).toBeLessThanOrEqual(boxes.bar);
  } finally {
    await context.close();
  }
});
