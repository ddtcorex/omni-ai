// The service worker imports these modules; the path-based mocks below are
// what the tests assert against, so no namespace imports are needed here.
jest.mock("../../lib/history");
jest.mock("../../lib/ai-service");

describe("Service Worker Integration", () => {
  let chromeMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Manual Chrome Mock (bypassing jest-chrome to ensure full control over event listeners and module loading)
    chromeMock = {
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
        getURL: jest.fn((path) => path),
      },
      i18n: { getMessage: jest.fn((key) => key) },
      contextMenus: {
        create: jest.fn(),
        onClicked: { addListener: jest.fn() },
      },
      tabs: {
        query: jest.fn().mockResolvedValue([]),
        sendMessage: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        },
        session: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        },
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        },
        onChanged: { addListener: jest.fn() },
      },
      identity: { getAuthToken: jest.fn() },
      commands: { onCommand: { addListener: jest.fn() } },
    };

    global.chrome = chromeMock;
  });

  it("registers listeners on load", async () => {
    await import("../../background/service-worker");

    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(chromeMock.contextMenus.onClicked.addListener).toHaveBeenCalled();
  });

  it("preserves existing settings while defaulting showFloatingButton to true on install", async () => {
    chromeMock.storage.local.get.mockResolvedValue({
      settings: { autoClose: true },
    });
    await import("../../background/service-worker");

    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
    installed({ reason: "install" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          autoClose: true,
          showFloatingButton: true,
        }),
      }),
    );
  });

  it("recreates context menus and seeds new setting defaults on update, not just install", async () => {
    // Reloading an unpacked extension in chrome://extensions (a routine dev
    // action per AGENTS.md's Dev Loop) fires onInstalled with reason
    // "update", not "install" — and Chrome clears the extension's context
    // menu items on that reload. If update is a no-op, the menu never comes
    // back, and any new settings default introduced after a user's original
    // install (e.g. showFloatingButton) never gets seeded for them either.
    chromeMock.storage.local.get.mockResolvedValue({ settings: { autoClose: true } });
    await import("../../background/service-worker");

    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
    chromeMock.contextMenus.create.mockClear();
    installed({ reason: "update" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "omni-ai-translate" }),
    );
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ autoClose: true, showFloatingButton: true }),
      }),
    );
  });

  it("opens a Settings tab on a fresh install, but not on a dev-reload update", async () => {
    await import("../../background/service-worker");
    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];

    installed({ reason: "install" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: "settings.html" });

    chromeMock.tabs.create.mockClear();
    installed({ reason: "update" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });

  it("routes keyboard commands to the most recently focused editor frame", async () => {
    const AIService = await import("../../lib/ai-service");
    AIService.improveText.mockResolvedValue("Improved");
    await import("../../background/service-worker");

    const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
    messageListener({ type: "EDITOR_FOCUSED" }, { tab: { id: 123 }, frameId: 7 }, jest.fn());
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "Original", isInput: true });

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_rephrase", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "GET_SELECTION" }),
      { frameId: 7 },
    );
  });

  it("restores the active editor frame after a service-worker restart", async () => {
    chromeMock.storage.session.get.mockResolvedValue({ omni_ai_active_frame_123: 7 });
    await import("../../background/service-worker");
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "Original", isInput: true });

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_rephrase", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "GET_SELECTION" }),
      { frameId: 7 },
    );
  });

  it("routes to the top frame (not a broadcast) once the editor context becomes static", async () => {
    await import("../../background/service-worker");
    const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
    messageListener({ type: "EDITOR_FOCUSED" }, { tab: { id: 123 }, frameId: 7 }, jest.fn());
    messageListener({ type: "EDITOR_BLURRED" }, { tab: { id: 123 }, frameId: 0 }, jest.fn());
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "Original", isInput: true });

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_rephrase", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.storage.session.remove).toHaveBeenCalledWith("omni_ai_active_frame_123");
    // Regression guard: with manifest.json's all_frames:true, omitting frameId
    // broadcasts to every frame on the page (per chrome.tabs.sendMessage docs)
    // and Chrome resolves the reply from whichever frame answers first — a race
    // that silently drops or corrupts the real top-frame selection whenever the
    // page has any other frame (ads, embeds, trackers). Must target frame 0
    // explicitly instead of omitting frameId.
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "GET_SELECTION" }),
      { frameId: 0 },
    );
  });

  it("routes keyboard commands to the top frame when no editor was ever focused", async () => {
    await import("../../background/service-worker");
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "Page text", isInput: false });

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_translate", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // A tab that never sent EDITOR_FOCUSED (e.g. the user only ever selected
    // plain page text) must still target frame 0 explicitly, not broadcast.
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "GET_SELECTION" }),
      { frameId: 0 },
    );
  });

  it("routes the quick_translate shortcut through smartTranslate, matching the on-page Smart Translation card", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "xin chao", isInput: false });
    chromeMock.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi", defaultLanguage: "en" });
    AIService.smartTranslate.mockResolvedValue("Hello");
    History.addToHistory.mockResolvedValue({});

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_translate", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Regression guard: the Alt+T shortcut previously called translateText()
    // (a fixed one-way translate to primaryLanguage) instead of the same
    // direction-detecting smartTranslate() the on-page "Smart Translation"
    // card uses, so the shortcut behaved differently from that menu action.
    expect(AIService.smartTranslate).toHaveBeenCalledWith("xin chao", "vi", "en");
    expect(AIService.translateText).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        type: "SHOW_RESULT",
        payload: expect.objectContaining({ action: "smart_translate", result: "Hello" }),
      }),
      { frameId: 0 },
    );
  });

  it("handles WRITING_ACTION message correctly", async () => {
    // Re-import dependencies to get the fresh mocks associated with the current module registry
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");

    // Find the message listener
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    expect(listener).toBeDefined();

    // Mock dependencies
    AIService.improveText.mockResolvedValue("Improved Text");
    History.addToHistory.mockResolvedValue({});

    // Mock active tab
    const mockTab = { id: 123, url: "http://example.com" };
    chromeMock.tabs.query.mockResolvedValue([mockTab]);

    // Mock sendResponse
    const sendResponse = jest.fn();

    // Simulate message
    const message = {
      type: "WRITING_ACTION",
      payload: { action: "grammar", preset: "email", text: "original text" },
    };

    // Call listener
    const result = listener(message, {}, sendResponse);

    // Expect it to return true for async response
    expect(result).toBe(true);

    // Wait for async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify AI Service call
    expect(AIService.improveText).toHaveBeenCalledWith("original text", "grammar", "email");

    // Verify content script update
    // chromeMock.tabs.sendMessage expectation removed as handleWritingAction does not broadcast SHOW_RESULT

    // Verify response sent back to caller (popup or content)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { response: "Improved Text" },
    });

    // Verify history update
    expect(History.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "grammar",
        inputText: "original text",
        outputText: "Improved Text",
      }),
    );
  });

  it("QUICK_ACTION smart_translate reads languages from storage.sync", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    AIService.smartTranslate.mockResolvedValue("TRANSLATED");
    History.addToHistory.mockResolvedValue({});
    chromeMock.tabs.query.mockResolvedValue([{ id: 123, url: "http://example.com" }]);
    chromeMock.storage.sync.get.mockResolvedValue({ primaryLanguage: "en", defaultLanguage: "vi" });

    const sendResponse = jest.fn();
    const returned = listener(
      {
        type: "QUICK_ACTION",
        payload: { action: "smart_translate", preset: "casual", text: "xin chao" },
      },
      {},
      sendResponse,
    );
    expect(returned).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const syncKeys = chromeMock.storage.sync.get.mock.calls.map((c) => c[0]).flat();
    expect(syncKeys).toEqual(expect.arrayContaining(["primaryLanguage", "defaultLanguage"]));
    // regression guard: the local area must no longer be consulted for these keys
    const localKeys = chromeMock.storage.local.get.mock.calls.map((c) => c[0]).flat();
    expect(localKeys).not.toContain("primaryLanguage");
    expect(localKeys).not.toContain("defaultLanguage");
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("QUICK_ACTION explain reads primaryLanguage from storage.sync", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    AIService.explainText.mockResolvedValue("EXPLAINED");
    History.addToHistory.mockResolvedValue({});
    chromeMock.tabs.query.mockResolvedValue([{ id: 123, url: "http://example.com" }]);
    chromeMock.storage.sync.get.mockResolvedValue({ primaryLanguage: "vi" });

    const sendResponse = jest.fn();
    const returned = listener(
      { type: "QUICK_ACTION", payload: { action: "explain", preset: "casual", text: "texto" } },
      {},
      sendResponse,
    );
    expect(returned).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith("primaryLanguage");
    expect(AIService.explainText).toHaveBeenCalledWith("texto", "vi");
    // regression guard: the local area must not be consulted for these keys
    const localKeys = chromeMock.storage.local.get.mock.calls.map((c) => c[0]).flat();
    expect(localKeys).not.toContain("primaryLanguage");
    expect(localKeys).not.toContain("defaultLanguage");
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("context menu translate uses smartTranslate, matching the Alt+T shortcut and the menu card", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const menuListener = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0];

    AIService.smartTranslate.mockResolvedValue("TRANSLATED");
    History.addToHistory.mockResolvedValue({});
    chromeMock.storage.sync.get.mockResolvedValue({});

    menuListener({ menuItemId: "omni-ai-translate", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Must consult storage.sync (never local) for both languages
    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith(["primaryLanguage", "defaultLanguage"]);
    const localKeys = chromeMock.storage.local.get.mock.calls.map((c) => c[0]).flat();
    expect(localKeys).not.toContain("defaultLanguage");
    // No configured languages -> documented fallbacks
    expect(AIService.smartTranslate).toHaveBeenCalledWith("hola", "vi", "en");
    expect(AIService.translateText).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "SHOW_RESULT" }),
      { frameId: 0 },
    );
  });

  it("registers exactly the 5 reordered context menu items: translate, rephrase, emojify, summarize, ask", async () => {
    await import("../../background/service-worker");
    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
    installed({ reason: "install" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const ids = chromeMock.contextMenus.create.mock.calls.map((c) => c[0].id);
    expect(ids).toEqual([
      "omni-ai-translate",
      "omni-ai-rephrase",
      "omni-ai-emojify",
      "omni-ai-summarize",
      "omni-ai-ask",
    ]);
    // The old Improve/Explain items were replaced, not just reordered
    expect(ids).not.toContain("omni-ai-improve");
    expect(ids).not.toContain("omni-ai-explain");
  });

  it("context menu rephrase/emojify/summarize call the matching AI actions", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const menuListener = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0];

    AIService.improveText.mockResolvedValue("REPHRASED");
    AIService.emojifyText.mockResolvedValue("EMOJIFIED 🎉");
    AIService.summarizeText.mockResolvedValue("SUMMARIZED");
    History.addToHistory.mockResolvedValue({});

    menuListener({ menuItemId: "omni-ai-rephrase", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(AIService.improveText).toHaveBeenCalledWith("hola", "rephrase", "general");

    menuListener({ menuItemId: "omni-ai-emojify", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(AIService.emojifyText).toHaveBeenCalledWith("hola");

    menuListener({ menuItemId: "omni-ai-summarize", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(AIService.summarizeText).toHaveBeenCalledWith("hola");
  });

  it("context menu ask opens the Quick Ask overlay instead of calling an AI action", async () => {
    const AIService = await import("../../lib/ai-service");

    await import("../../background/service-worker");
    const menuListener = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0];

    menuListener({ menuItemId: "omni-ai-ask", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      { type: "SHOW_QUICK_ASK_OVERLAY" },
      { frameId: 0 },
    );
    expect(AIService.quickAsk).not.toHaveBeenCalled();
  });

  it("GET_API_KEY keeps channel open and replies asynchronously", async () => {
    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    chromeMock.storage.local.get.mockResolvedValue({ geminiApiKey: "k-test" });
    const sendResponse = jest.fn();
    const returned = listener({ type: "GET_API_KEY" }, {}, sendResponse);

    // Channel must be kept open for the async reply. (Pre-fix, fall-through
    // into VALIDATE_CONFIG also lands on a `return true`, so this alone does
    // not discriminate — the call-count assertion below does.)
    expect(returned).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Exactly one response: the GET_API_KEY success. A second call means the
    // VALIDATE_CONFIG case was reached via fall-through (the bug).
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, apiKey: "k-test" });
  });
});
