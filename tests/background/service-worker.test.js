import * as History from "../../lib/history";
import * as AIService from "../../lib/ai-service";

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
      },
      contextMenus: {
        create: jest.fn(),
        onClicked: { addListener: jest.fn() },
      },
      tabs: {
        query: jest.fn().mockResolvedValue([]),
        sendMessage: jest.fn().mockResolvedValue({}),
      },
      storage: {
        local: {
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

  it("context menu legacy translate falls back to defaultLanguage from storage.sync", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const menuListener = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0];

    AIService.translateText.mockResolvedValue("TRANSLATED");
    History.addToHistory.mockResolvedValue({});
    chromeMock.storage.sync.get.mockResolvedValue({});

    menuListener({ menuItemId: "omni-ai-translate", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Legacy flow must consult storage.sync (never local) before translating
    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith("defaultLanguage");
    const localKeys = chromeMock.storage.local.get.mock.calls.map((c) => c[0]).flat();
    expect(localKeys).not.toContain("defaultLanguage");
    // No configured language -> documented fallback
    expect(AIService.translateText).toHaveBeenCalledWith("hola", "en");
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "SHOW_RESULT" }),
    );
  });

  it("context menu legacy explain falls back to primaryLanguage from storage.sync", async () => {
    const AIService = await import("../../lib/ai-service");
    const History = await import("../../lib/history");

    await import("../../background/service-worker");
    const menuListener = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0];

    AIService.explainText.mockResolvedValue("EXPLAINED");
    History.addToHistory.mockResolvedValue({});
    chromeMock.storage.sync.get.mockResolvedValue({});

    menuListener({ menuItemId: "omni-ai-explain", selectionText: "hola" }, { id: 123 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chromeMock.storage.sync.get).toHaveBeenCalledWith("primaryLanguage");
    // No configured language -> same "vi" convention as handleQuickAction's explain
    expect(AIService.explainText).toHaveBeenCalledWith("hola", "vi");
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ type: "SHOW_RESULT" }),
    );
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
