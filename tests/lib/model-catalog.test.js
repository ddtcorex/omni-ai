import {
  CACHE_TTL_MS,
  buildPickerModel,
  filterChatModels,
  isCacheFresh,
  normalizeSavedId,
} from "../../lib/model-catalog.js";

const m = (id, extra = {}) => ({
  id,
  label: id,
  createdAt: null,
  state: "unknown",
  methods: null,
  ...extra,
});

test("openai filter keeps chat families and drops everything else", () => {
  const ids = filterChatModels("openai", [
    m("gpt-5.7-nova"),
    m("o4-mini"),
    m("text-embedding-3-large"),
    m("whisper-1"),
    m("dall-e-3"),
    m("omni-moderation-latest"),
  ]).map((x) => x.id);

  expect(ids).toEqual(["gpt-5.7-nova", "o4-mini"]);
});

test("openai filter drops families that the chat completions endpoint cannot serve", () => {
  // Every one of these starts with a chat prefix but answers images, audio,
  // realtime sessions or the Responses API only.
  const ids = filterChatModels("openai", [
    m("gpt-image-1"),
    m("gpt-4o-mini-tts"),
    m("gpt-4o-transcribe"),
    m("gpt-realtime"),
    m("gpt-4o-audio-preview"),
    m("gpt-4o-mini-search-preview"),
    m("codex-mini-latest"),
    m("gpt-5-codex"),
    m("o1-pro"),
    m("o3-pro-2025-06-10"),
    m("o3-deep-research"),
    m("gpt-3.5-turbo-instruct"),
    m("chatgpt-4o-latest"),
    m("gpt-5.6-terra"),
  ]).map((x) => x.id);

  expect(ids).toEqual(["chatgpt-4o-latest", "gpt-5.6-terra"]);
});

test("gemini filter drops speech, image and live models that still list generateContent", () => {
  const gen = { methods: ["generateContent"] };
  const ids = filterChatModels("google", [
    m("gemini-2.5-flash-preview-tts", gen),
    m("gemini-2.5-flash-image", gen),
    m("gemini-2.5-flash-native-audio-preview", gen),
    m("gemini-2.0-flash-live-001", gen),
    m("gemini-3.6-flash", gen),
  ]).map((x) => x.id);

  expect(ids).toEqual(["gemini-3.6-flash"]);
});

test("groq filter drops its speech models", () => {
  const ids = filterChatModels("groq", [
    m("canopylabs/orpheus-v1-english"),
    m("whisper-large-v3"),
    m("llama-3.3-70b-versatile"),
  ]).map((x) => x.id);

  expect(ids).toEqual(["llama-3.3-70b-versatile"]);
});

test("gemini filter requires generateContent", () => {
  const ids = filterChatModels("google", [
    m("gemini-3.6-flash", { methods: ["generateContent"] }),
    m("text-embedding-004", { methods: ["embedContent"] }),
    m("aqa", { methods: [] }),
  ]).map((x) => x.id);

  expect(ids).toEqual(["gemini-3.6-flash"]);
});

test("retired models never survive and custom gateway is never filtered", () => {
  expect(
    filterChatModels("anthropic", [
      m("claude-old", { state: "retired" }),
      m("claude-sonnet-5", { state: "active" }),
    ]),
  ).toHaveLength(1);
  expect(filterChatModels("customGateway", [m("anything-goes")])).toHaveLength(1);
});

test("an empty result from a non empty payload is not the filter's problem to hide", () => {
  const listed = [m("text-embedding-3-large")];
  expect(filterChatModels("openai", listed)).toHaveLength(0);
});

const listed = [
  { id: "gpt-5.6-sol", label: "gpt-5.6-sol", createdAt: 300, state: "active", methods: null },
  { id: "gpt-5.7-nova", label: "gpt-5.7-nova", createdAt: 100, state: "active", methods: null },
];
const bundled = [{ id: "openai-gpt-5.6-sol", name: "GPT-5.6 Sol", apiModel: "gpt-5.6-sol" }];
const toApiName = (id) =>
  id === "openai-gpt-5.6-sol" ? "gpt-5.6-sol" : id === "openai-gpt-4o" ? "gpt-4o" : id;

test("a shipped saved id dedupes against its fetched raw id instead of showing as missing", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: "openai-gpt-5.6-sol",
    bundled,
    recommended: [],
    toApiName,
  });

  expect(model.pinned).toBeNull();
  expect(model.recommended.map((x) => x.id)).toContain("gpt-5.6-sol");
});

test("a genuinely absent saved model is pinned and still selectable", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: "openai-gpt-4o",
    bundled,
    recommended: [],
    toApiName,
  });

  expect(model.pinned).toEqual({ id: "gpt-4o", label: "gpt-4o", state: "missing" });
});

test("recommended comes first and recent is capped newest first", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: null,
    bundled,
    recommended: ["openai-gpt-5.6-sol"],
    toApiName,
    cap: 1,
  });

  expect(model.recommended[0].id).toBe("gpt-5.6-sol");
  expect(model.recent).toHaveLength(1);
  expect(model.recent[0].id).toBe("gpt-5.7-nova");
  expect(model.total).toBe(2);
});

test("no fetch falls back to the bundled list and says so", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed: null,
    savedModelId: null,
    bundled,
    recommended: ["openai-gpt-5.6-sol"],
    toApiName,
  });

  expect(model.source).toBe("bundled");
  expect(model.recommended.map((x) => x.id)).toEqual(["openai-gpt-5.6-sol"]);
});

test("a filter that matches nothing degrades to the raw list instead of an empty picker", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed: [m("text-embedding-3-large", { createdAt: 5 })],
    savedModelId: null,
    bundled,
    recommended: [],
    toApiName,
  });

  expect(model.source).toBe("live");
  expect(model.recent.map((x) => x.id)).toEqual(["text-embedding-3-large"]);
});

test("cache is fresh for seven days and stale after", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  expect(isCacheFresh(now - CACHE_TTL_MS + 1000, now)).toBe(true);
  expect(isCacheFresh(now - CACHE_TTL_MS - 1000, now)).toBe(false);
});

test("normalizeSavedId returns null for an empty value", () => {
  expect(normalizeSavedId("", toApiName)).toBeNull();
});

test("typing finds a model that sits past the cap", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: `gpt-5.${i}-model`,
    label: `gpt-5.${i}-model`,
    createdAt: i,
    state: "active",
    methods: null,
  }));
  const model = buildPickerModel({
    providerId: "openai",
    listed: many,
    savedModelId: null,
    bundled,
    recommended: [],
    toApiName,
    cap: 5,
    query: "gpt-5.29",
  });

  expect(model.recent.map((x) => x.id)).toEqual(["gpt-5.29-model"]);
  expect(model.matches).toBe(1);
  expect(model.total).toBe(30);
});

test("the custom model sentinels survive a live catalog", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: null,
    bundled,
    recommended: [],
    toApiName,
    sentinels: [{ id: "openai-custom", label: "OpenAI Custom Model..." }],
  });

  expect(model.recent.map((x) => x.id)).toContain("openai-custom");
});

test("a provider that is not the saved model's owner never pins it", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: "gemini-3.6-flash",
    bundled,
    recommended: [],
    toApiName,
    ownsSavedModel: false,
  });

  expect(model.pinned).toBeNull();
});

test("an empty live catalog keeps the bundled list instead of emptying the group", () => {
  const model = buildPickerModel({
    providerId: "openai",
    listed: [],
    savedModelId: null,
    bundled,
    recommended: [],
    toApiName,
  });

  expect(model.source).toBe("bundled");
  expect(model.recommended.length + model.recent.length).toBeGreaterThan(0);
});

test("a search keeps the selected model in its group so the select never blanks", () => {
  const live = buildPickerModel({
    providerId: "openai",
    listed,
    savedModelId: "openai-gpt-5.6-sol",
    bundled,
    toApiName,
    query: "nova",
    keepId: "openai-gpt-5.6-sol",
  });
  const liveIds = [...live.recommended, ...live.recent].map((x) => x.id);
  expect(liveIds).toEqual(expect.arrayContaining(["gpt-5.6-sol", "gpt-5.7-nova"]));
  expect(live.matches).toBe(1);

  const offline = buildPickerModel({
    providerId: "openai",
    listed: null,
    savedModelId: null,
    bundled,
    toApiName,
    query: "zzz",
    keepId: "openai-gpt-5.6-sol",
  });
  expect(offline.recent.map((x) => x.id)).toEqual(["openai-gpt-5.6-sol"]);
  expect(offline.matches).toBe(0);
});
