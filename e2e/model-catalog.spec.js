const { test, expect } = require("@playwright/test");
const { launchWithExtension } = require("./extension.fixtures");

// The model picker renders five provider groups at once, which the jsdom tests
// never did: each of them rendered a single provider. These specs cover the
// cross-group behaviour a user actually meets, plus the apiProvider contract
// that keeps a fetched model id routable.

const CACHED_OPENAI = [
  { id: "gpt-5.6-sol", label: "gpt-5.6-sol", createdAt: 2, state: "active", methods: null },
  { id: "gpt-5.7-nova", label: "gpt-5.7-nova", createdAt: 1, state: "active", methods: null },
];

async function openSettings(context, sw, seed) {
  // Seed through the service worker: a fresh page has no chrome.* API until it
  // is an extension page.
  await sw.evaluate((values) => chrome.storage.local.set(values), {
    geminiApiKey: "",
    openaiApiKey: "",
    apiModel: "gemini-3.6-flash",
    apiProvider: "google",
    ...seed,
  });

  const page = await context.newPage();
  const extId = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${extId}/settings.html`);
  // init() is async, and <optgroup> never counts as "visible" to Playwright
  // (a native select renders its options outside the DOM box model).
  await page.waitForFunction(() => document.querySelectorAll("#apiModel optgroup").length > 0);
  return page;
}

test("renders every provider group plus the custom model escape hatches", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, {
      modelCatalog: { openai: { fetchedAt: Date.now(), models: CACHED_OPENAI, truncated: false } },
    });

    const groups = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#apiModel optgroup")).map((group) => group.label),
    );
    expect(groups).toEqual([
      "Google Gemini",
      "OpenAI",
      "Groq",
      "Anthropic Claude",
      "Custom Gateway",
    ]);

    const openaiOptions = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#apiModel optgroup[label='OpenAI'] option")).map(
        (option) => option.value,
      ),
    );
    // Nothing fetched for this provider yet, so the bundled catalog renders, and
    // its custom escape hatch appears exactly once.
    expect(openaiOptions).toContain("openai-gpt-5.6-sol");
    expect(openaiOptions.filter((value) => value === "openai-custom")).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("the saved model stays selected after a catalog renders", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, {
      apiModel: "openai-gpt-5.6-sol",
      apiProvider: "openai",
      openaiApiKey: "sk-test",
      modelCatalog: { openai: { fetchedAt: Date.now(), models: CACHED_OPENAI, truncated: false } },
    });

    // The shipped id and the fetched id address one model, so the select holds
    // the API name and must not be blank.
    await expect(page.locator("#apiModel")).toHaveValue("gpt-5.6-sol");
  } finally {
    await context.close();
  }
});

test("the search box reaches a model past the visible cap", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `gpt-5.${i}-model`,
      label: `gpt-5.${i}-model`,
      createdAt: 100 - i,
      state: "active",
      methods: null,
    }));
    const page = await openSettings(context, sw, {
      apiModel: "openai-gpt-5.6-sol",
      apiProvider: "openai",
      openaiApiKey: "sk-test",
      modelCatalog: { openai: { fetchedAt: Date.now(), models: many, truncated: false } },
    });

    await page.fill("#modelSearch", "gpt-5.39");
    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#apiModel option")).map((option) => option.value),
    );
    // The saved model keeps its pinned row; the search reaches the match past the cap.
    expect(values).toEqual(["gpt-5.6-sol", "gpt-5.39-model"]);
  } finally {
    await context.close();
  }
});

test("saving writes the provider beside the model", async () => {
  const { context, sw } = await launchWithExtension();
  try {
    const page = await openSettings(context, sw, {
      apiModel: "openai-gpt-5.6-sol",
      apiProvider: "openai",
      openaiApiKey: "sk-test",
      modelCatalog: { openai: { fetchedAt: Date.now(), models: CACHED_OPENAI, truncated: false } },
    });

    await page.selectOption("#apiModel", "gpt-5.7-nova");
    await page.click("#saveBtn");
    await expect(page.locator("#saveStatus")).not.toBeEmpty();

    const stored = await page.evaluate(() => chrome.storage.local.get(["apiModel", "apiProvider"]));
    expect(stored.apiModel).toBe("gpt-5.7-nova");
    expect(stored.apiProvider).toBe("openai");
  } finally {
    await context.close();
  }
});
