// The service worker imports these modules; the path-based mocks below are
// what the tests assert against, so no namespace imports are needed here.
jest.mock("../../lib/history");
jest.mock("../../lib/ai-service");
jest.mock("../../lib/providers/index");

describe("Service Worker Integration", () => {
  let chromeMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Manual Chrome Mock (bypassing the shared tests/helpers/chrome-mock.js to
    // keep full control over event listeners and module loading)
    chromeMock = {
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onMessage: { addListener: jest.fn() },
        onConnect: { addListener: jest.fn() },
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
      commands: { onCommand: { addListener: jest.fn() } },
      sidePanel: { setPanelBehavior: jest.fn().mockResolvedValue(undefined) },
    };

    global.chrome = chromeMock;
  });

  it("registers listeners on load", async () => {
    await import("../../background/service-worker");

    expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(chromeMock.contextMenus.onClicked.addListener).toHaveBeenCalled();
  });

  it("configures the toolbar icon to open the side panel directly, not a popup window", async () => {
    await import("../../background/service-worker");

    expect(chromeMock.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
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

  it("seeds the default flash actions on install without clobbering an existing selection", async () => {
    chromeMock.storage.local.get.mockResolvedValue({
      settings: { flashActions: ["summarize"] },
    });
    await import("../../background/service-worker");

    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];
    installed({ reason: "install" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ flashActions: ["summarize"] }),
      }),
    );
  });

  it("recreates context menus and seeds new setting defaults on update, not just install", async () => {
    // Reloading an unpacked extension in chrome://extensions (a routine dev
    // action per AGENTS.md's Dev Loop) fires onInstalled with reason
    // "update", not "install", and Chrome clears the extension's context
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

  it("clears the stale OAuth 'user' profile from sync storage on update, not on install", async () => {
    await import("../../background/service-worker");
    const installed = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0];

    installed({ reason: "install" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.storage.sync.remove).not.toHaveBeenCalled();

    installed({ reason: "update" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeMock.storage.sync.remove).toHaveBeenCalledWith("user");
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

  it('quick_rephrase sends PROCESSING_START with action "rephrase"', async () => {
    await import("../../background/service-worker");
    chromeMock.tabs.sendMessage.mockResolvedValue({ selection: "Original", isInput: true });

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_rephrase", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      { type: "PROCESSING_START", action: "rephrase" },
      expect.anything(),
    );
  });

  it("RERUN_ACTION runs processSelectedText for the sender tab and replies success", async () => {
    const AIService = await import("../../lib/ai-service");
    AIService.improveText.mockResolvedValue("Improved");
    await import("../../background/service-worker");
    const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    const ret = messageListener(
      { type: "RERUN_ACTION", action: "rephrase", text: "Original", isInput: true },
      { tab: { id: 123 } },
      sendResponse,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Replies synchronously, so no `return true` is needed.
    expect(ret).not.toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(AIService.improveText).toHaveBeenCalledWith("Original", "rephrase", "general");
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        type: "SHOW_RESULT",
        payload: expect.objectContaining({ action: "rephrase", result: "Improved", isInput: true }),
      }),
      expect.anything(),
    );
  });

  it.each([
    ["a result", () => Promise.resolve("Improved")],
    ["an error", () => Promise.reject(new Error("boom"))],
  ])(
    "RERUN_ACTION delivers %s to the frame that asked, even after the editor frame was cleared",
    async (_label, impl) => {
      const AIService = await import("../../lib/ai-service");
      AIService.improveText.mockImplementation(impl);
      await import("../../background/service-worker");
      const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
      // The iframe editor's retry focused the shadow UI: the frame was cleared.
      messageListener({ type: "EDITOR_FOCUSED" }, { tab: { id: 123 }, frameId: 7 }, jest.fn());
      messageListener({ type: "EDITOR_BLURRED" }, { tab: { id: 123 }, frameId: 7 }, jest.fn());
      await new Promise((resolve) => setTimeout(resolve, 0));

      messageListener(
        { type: "RERUN_ACTION", action: "rephrase", text: "Original", isInput: true },
        { tab: { id: 123 }, frameId: 7 },
        jest.fn(),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      const showResults = chromeMock.tabs.sendMessage.mock.calls.filter(
        ([, message]) => message.type === "SHOW_RESULT",
      );
      expect(showResults).toHaveLength(1);
      expect(showResults[0][0]).toBe(123);
      expect(showResults[0][2]).toEqual({ frameId: 7 });
    },
  );

  it.each([
    ["a missing action", { text: "Original" }, { tab: { id: 123 } }],
    ["an unknown action", { action: "bogus", text: "Original" }, { tab: { id: 123 } }],
    ["empty text", { action: "rephrase", text: "   " }, { tab: { id: 123 } }],
    ["a missing sender tab", { action: "rephrase", text: "Original" }, {}],
  ])("RERUN_ACTION rejects %s without calling the AI", async (_label, fields, sender) => {
    const AIService = await import("../../lib/ai-service");
    await import("../../background/service-worker");
    const messageListener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();

    messageListener({ type: "RERUN_ACTION", isInput: false, ...fields }, sender, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ success: false });
    expect(AIService.improveText).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
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
    // and Chrome resolves the reply from whichever frame answers first, a race
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

  it("routes the quick_menu shortcut to opening the quick action menu directly, not an AI action", async () => {
    const AIService = await import("../../lib/ai-service");

    await import("../../background/service-worker");

    const commandListener = chromeMock.commands.onCommand.addListener.mock.calls[0][0];
    await commandListener("quick_menu", { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      { type: "SHOW_QUICK_ACTION_MENU" },
      { frameId: 0 },
    );
    expect(AIService.improveText).not.toHaveBeenCalled();
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

    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith([
      "primaryLanguage",
      "defaultLanguage",
    ]);
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
    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith([
      "primaryLanguage",
      "defaultLanguage",
    ]);
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
    // not discriminate; the call-count assertion below does.)
    expect(returned).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Exactly one response: the GET_API_KEY success. A second call means the
    // VALIDATE_CONFIG case was reached via fall-through (the bug).
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, apiKey: "k-test" });
  });

  it("omni-chat port resolves the configured model/provider (e.g. Custom Gateway) instead of always defaulting to Gemini", async () => {
    // Regression test: getChatConfig() used to read a nonexistent "activeModel"
    // key off chrome.storage.sync (Storage Map only ever put primaryLanguage/
    // defaultLanguage/omni_ai_theme there), so it always fell through to the
    // "google" provider default regardless of what the user actually
    // configured (apiModel lives in chrome.storage.local).
    chromeMock.storage.local.get.mockResolvedValue({
      apiModel: "custom-gateway",
      customGatewayApiKey: "gw-secret-key",
      customGatewayBaseUrl: "https://gw.example.com/v1",
      customGatewayModelName: "my-custom-model",
      geminiApiKey: "should-not-be-used",
    });

    const providers = await import("../../lib/providers/index");
    providers.generateContentStream.mockResolvedValue("assistant reply");

    await import("../../background/service-worker");
    const handlePort = chromeMock.runtime.onConnect.addListener.mock.calls[0][0];

    const port = {
      name: "omni-chat",
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
    };
    handlePort(port);
    const onMessage = port.onMessage.addListener.mock.calls[0][0];

    await onMessage({ type: "chat", message: "hi", pageContext: "", history: [] });

    expect(providers.generateContentStream).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        apiKey: "gw-secret-key",
        baseUrl: "https://gw.example.com/v1",
        model: "my-custom-model",
        // config.model is overwritten with the user's raw upstream model
        // name above, which never matches an AI_PROVIDERS registry id -- the
        // explicit provider hint is what lets generateContentStream() route
        // correctly instead of silently falling back to Gemini (see
        // tests/lib/providers/index.stream.test.js for that half of the fix).
        provider: "customGateway",
      }),
      expect.any(Function),
      expect.any(Object),
    );
  });

  describe("LIST_MODELS", () => {
    it("uses the in form key when present and caches the result", async () => {
      const Providers = await import("../../lib/providers/index");
      await import("../../background/service-worker");
      const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

      Providers.listModels.mockResolvedValue({
        models: [{ id: "gpt-5.7-nova" }],
        truncated: false,
      });
      chromeMock.storage.local.get.mockResolvedValue({});

      const sendResponse = jest.fn();
      const returned = listener(
        { type: "LIST_MODELS", payload: { provider: "openai", key: "sk-inform" } },
        {},
        sendResponse,
      );

      expect(returned).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(Providers.listModels).toHaveBeenCalledWith("openai", { apiKey: "sk-inform" });
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, truncated: false }),
      );
    });

    it("falls back to the stored key and reports a failure without throwing", async () => {
      const Providers = await import("../../lib/providers/index");
      await import("../../background/service-worker");
      const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

      chromeMock.storage.local.get.mockResolvedValue({ openaiApiKey: "sk-stored" });
      Providers.listModels.mockRejectedValue(new Error("bad key"));

      const sendResponse = jest.fn();
      listener({ type: "LIST_MODELS", payload: { provider: "openai" } }, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(Providers.listModels).toHaveBeenCalledWith("openai", { apiKey: "sk-stored" });
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: "bad key" });
    });

    it("answers a missing key without calling the provider", async () => {
      const Providers = await import("../../lib/providers/index");
      await import("../../background/service-worker");
      const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

      chromeMock.storage.local.get.mockResolvedValue({});
      Providers.listModels.mockReset();

      const sendResponse = jest.fn();
      listener({ type: "LIST_MODELS", payload: { provider: "openai" } }, {}, sendResponse);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(Providers.listModels).not.toHaveBeenCalled();
      expect(sendResponse.mock.calls[0][0].success).toBe(false);
    });
  });

  it("LIST_MODELS uses the stored Custom Gateway base URL", async () => {
    const Providers = await import("../../lib/providers/index");
    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    chromeMock.storage.local.get.mockResolvedValue({
      customGatewayApiKey: "gw-key",
      customGatewayBaseUrl: "https://gw.example/v1",
    });
    Providers.listModels.mockResolvedValue({ models: [], truncated: false });

    const sendResponse = jest.fn();
    listener({ type: "LIST_MODELS", payload: { provider: "customGateway" } }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Providers.listModels).toHaveBeenCalledWith("customGateway", {
      apiKey: "gw-key",
      baseUrl: "https://gw.example/v1",
    });
  });

  it("getChatConfig routes a raw fetched model id through the stored provider", async () => {
    chromeMock.storage.local.get.mockResolvedValue({
      apiModel: "gpt-5.7-nova",
      apiProvider: "openai",
      openaiApiKey: "sk-o",
      geminiApiKey: "should-not-be-used",
    });

    const providers = await import("../../lib/providers/index");
    providers.generateContentStream.mockResolvedValue("assistant reply");

    await import("../../background/service-worker");
    const connectListener = chromeMock.runtime.onConnect.addListener.mock.calls[0][0];
    const port = {
      name: "omni-chat",
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
    };

    connectListener(port);
    const onMessage = port.onMessage.addListener.mock.calls[0][0];
    await onMessage({ type: "chat", message: "hi", pageContext: "", history: [] });

    const AIService = providers;
    expect(AIService.generateContentStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "openai", apiKey: "sk-o" }),
      expect.anything(),
      expect.anything(),
    );
  });

  async function chatConfigFor(stored) {
    chromeMock.storage.local.get.mockResolvedValue(stored);
    const providers = await import("../../lib/providers/index");
    providers.generateContentStream.mockResolvedValue("ok");
    await import("../../background/service-worker");
    const connectListener = chromeMock.runtime.onConnect.addListener.mock.calls[0][0];
    const port = {
      name: "omni-chat",
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
    };
    connectListener(port);
    const onMessage = port.onMessage.addListener.mock.calls[0][0];
    await onMessage({ type: "chat", message: "hi", pageContext: "", history: [] });
    return providers.generateContentStream.mock.calls[0][1];
  }

  it("getChatConfig keeps a fetched gateway model over a stale typed model name", async () => {
    // The typed name belongs to the "custom-gateway" entry only; it stays in
    // storage after the user picks a listed gateway model instead.
    const config = await chatConfigFor({
      apiModel: "anthropic/claude-haiku-5.5",
      apiProvider: "customGateway",
      customGatewayBaseUrl: "https://gw.example/v1",
      customGatewayModelName: "old/manual-model",
    });

    expect(config).toMatchObject({
      provider: "customGateway",
      model: "anthropic/claude-haiku-5.5",
      baseUrl: "https://gw.example/v1",
    });
  });

  it("getChatConfig still sends the typed name for the custom-gateway entry", async () => {
    const config = await chatConfigFor({
      apiModel: "custom-gateway",
      customGatewayBaseUrl: "https://gw.example/v1",
      customGatewayModelName: "typed/model",
    });

    expect(config).toMatchObject({ provider: "customGateway", model: "typed/model" });
  });

  it("getChatConfig sends the typed name for a provider's custom entry", async () => {
    const config = await chatConfigFor({
      apiModel: "openai-custom",
      apiProvider: "openai",
      openaiApiKey: "sk-o",
      customModelName: "gpt-typed",
    });

    expect(config).toMatchObject({ provider: "openai", model: "gpt-typed", apiKey: "sk-o" });
  });

  it("a model-not-found failure reaches the overlay with its code", async () => {
    const AIService = await import("../../lib/ai-service");
    AIService.improveText.mockRejectedValue(
      Object.assign(new Error("The model does not exist"), { code: "model_not_found" }),
    );

    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    const sendResponse = jest.fn();
    listener(
      { type: "QUICK_ACTION", payload: { action: "grammar", text: "hi" } },
      { tab: { id: 5 }, frameId: 0 },
      sendResponse,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The overlay reads this reply, so the code has to survive the failure path.
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorCode: "model_not_found" }),
    );
  });

  it("OPEN_SETTINGS opens the options page", async () => {
    chromeMock.runtime.openOptionsPage = jest.fn();
    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    const sendResponse = jest.fn();
    listener({ type: "OPEN_SETTINGS" }, {}, sendResponse);

    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it("LIST_MODELS never pairs a stored key with a caller supplied base URL", async () => {
    const Providers = await import("../../lib/providers/index");
    await import("../../background/service-worker");
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

    chromeMock.storage.local.get.mockResolvedValue({
      customGatewayApiKey: "gw-key",
      customGatewayBaseUrl: "https://stored.example/v1",
    });
    Providers.listModels.mockResolvedValue({ models: [], truncated: false });

    const sendResponse = jest.fn();
    listener(
      {
        type: "LIST_MODELS",
        payload: { provider: "customGateway", baseUrl: "https://evil.example" },
      },
      {},
      sendResponse,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Providers.listModels).toHaveBeenCalledWith("customGateway", {
      apiKey: "gw-key",
      baseUrl: "https://stored.example/v1",
    });
  });
});
