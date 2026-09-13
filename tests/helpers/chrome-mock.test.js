const { createChromeMock } = require("./chrome-mock");

describe("chrome-mock helper", () => {
  it("creates an independent mock per call", () => {
    const first = createChromeMock();
    const second = createChromeMock();

    expect(first).not.toBe(second);
    expect(first.storage.local.get).not.toBe(second.storage.local.get);
  });

  it("exposes every Chrome API the extension calls, as jest.fn()s", () => {
    const chrome = createChromeMock();
    const methodPaths = [
      "runtime.getManifest",
      "runtime.getURL",
      "runtime.sendMessage",
      "runtime.connect",
      "runtime.openOptionsPage",
      "storage.local.get",
      "storage.local.set",
      "storage.local.remove",
      "storage.local.clear",
      "storage.local.getBytesInUse",
      "storage.sync.get",
      "storage.sync.set",
      "storage.sync.remove",
      "storage.sync.clear",
      "storage.sync.getBytesInUse",
      "storage.session.get",
      "storage.session.set",
      "storage.session.remove",
      "storage.session.clear",
      "storage.session.getBytesInUse",
      "tabs.query",
      "tabs.sendMessage",
      "tabs.create",
      "i18n.getMessage",
      "i18n.getUILanguage",
      "contextMenus.create",
      "contextMenus.removeAll",
      "sidePanel.setPanelBehavior",
      "sidePanel.open",
    ];

    for (const path of methodPaths) {
      const fn = path.split(".").reduce((node, key) => node[key], chrome);
      expect(typeof fn).toBe("function");
      // It must be a jest mock, not a plain function: the suite configures
      // every one of these with mockResolvedValue / mockImplementation.
      expect(typeof fn.mockImplementation).toBe("function");
    }
  });

  it("exposes every event the extension subscribes to, with addListener", () => {
    const chrome = createChromeMock();
    const eventPaths = [
      "runtime.onMessage",
      "runtime.onInstalled",
      "runtime.onConnect",
      "storage.onChanged",
      "tabs.onUpdated",
      "tabs.onActivated",
      "contextMenus.onClicked",
      "commands.onCommand",
    ];

    for (const path of eventPaths) {
      const event = path.split(".").reduce((node, key) => node[key], chrome);
      expect(typeof event.addListener.mockImplementation).toBe("function");
      expect(typeof event.removeListener).toBe("function");
      expect(typeof event.hasListener).toBe("function");
      // callListeners is how the repo's own plan docs drive onConnect; it must
      // exist so that idiom does not throw.
      expect(typeof event.callListeners).toBe("function");
    }
  });

  it("keeps jest-chrome's undefined defaults for value properties and unstubbed methods", () => {
    const chrome = createChromeMock();

    expect(chrome.runtime.id).toBeUndefined();
    expect(chrome.runtime.lastError).toBeUndefined();
    // A bare jest.fn() returns undefined and is NOT a thenable, exactly like
    // jest-chrome: any test that awaits a storage call must stub it first with
    // mockResolvedValue, which is what the existing suite already does.
    expect(chrome.storage.local.get("apiModel")).toBeUndefined();
  });

  it("supports the storage mocking style the existing suite uses", async () => {
    const chrome = createChromeMock();

    chrome.storage.local.get.mockResolvedValue({ apiModel: "gemini-3.6-flash" });
    await expect(chrome.storage.local.get("apiModel")).resolves.toEqual({
      apiModel: "gemini-3.6-flash",
    });
    expect(chrome.storage.local.get).toHaveBeenCalledWith("apiModel");

    chrome.storage.local.get.mockReset();
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(0);
  });

  it("lets a listener registered through addListener be invoked like the real event", () => {
    const chrome = createChromeMock();
    const listener = jest.fn();

    chrome.runtime.onMessage.addListener(listener);
    const registered = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    registered({ type: "PING" }, {}, jest.fn());

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    expect(listener).toHaveBeenCalledWith({ type: "PING" }, {}, expect.any(Function));
  });

  it("tracks registered listeners so hasListener and callListeners are truthful", () => {
    const chrome = createChromeMock();
    const first = jest.fn();
    const second = jest.fn();

    expect(chrome.runtime.onConnect.hasListeners()).toBe(false);

    chrome.runtime.onConnect.addListener(first);
    chrome.runtime.onConnect.addListener(second);
    expect(chrome.runtime.onConnect.hasListener(first)).toBe(true);
    expect(chrome.runtime.onConnect.hasListeners()).toBe(true);
    expect(chrome.runtime.onConnect.getListeners()).toEqual([first, second]);

    // The idiom the repo's plan docs teach for driving a Port.
    chrome.runtime.onConnect.callListeners({ name: "omni-chat" });
    expect(first).toHaveBeenCalledWith({ name: "omni-chat" });
    expect(second).toHaveBeenCalledWith({ name: "omni-chat" });

    chrome.runtime.onConnect.removeListener(first);
    expect(chrome.runtime.onConnect.hasListener(first)).toBe(false);
    expect(chrome.runtime.onConnect.getListeners()).toEqual([second]);

    chrome.runtime.onConnect.clearListeners();
    expect(chrome.runtime.onConnect.hasListeners()).toBe(false);
  });
});
