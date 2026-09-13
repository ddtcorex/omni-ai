"use strict";

/**
 * Shared Chrome extension API mock for Jest unit tests.
 *
 * Replaces the abandoned `jest-chrome` package (last publish 0.8.0, peer
 * `jest@^26.0.1 || ^27.0.0`), which cannot be installed next to jest 30.
 *
 * The surface is explicit rather than a Proxy that fabricates a `jest.fn()`
 * for every property: when a test or a module under test reaches for a Chrome
 * API that is not listed here, it throws a TypeError instead of silently
 * receiving `undefined`, so the gap cannot be missed.
 *
 * Defaults mirror jest-chrome's: every method is a bare `jest.fn()` returning
 * `undefined`, and value properties (`runtime.id`, `runtime.lastError`) are
 * `undefined`. Tests keep configuring implementations themselves with
 * `mockResolvedValue` / `mockImplementation`, exactly as before.
 *
 * Call sites this covers, keep in sync when the extension adopts a new API:
 * - lib/storage.js, lib/history.js, lib/theme-manager.js: storage.*, storage.onChanged
 * - lib/ai-service.js, lib/providers/*: i18n.getMessage
 * - background/service-worker.js: runtime.*, contextMenus, commands, sidePanel, tabs.*
 * - content/content.js: runtime.getURL, runtime.sendMessage, runtime.lastError, i18n.*
 * - sidepanel/sidepanel.js: runtime.connect
 * - settings.js: runtime.getManifest, storage.*
 *
 * `chrome.runtime.Port` is a JSDoc type reference only, so it needs no runtime shape.
 */

function createEvent() {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(() => false),
    hasListeners: jest.fn(() => false),
    dispatch: jest.fn(),
  };
}

function createStorageArea() {
  return {
    clear: jest.fn(),
    get: jest.fn(),
    getBytesInUse: jest.fn(),
    remove: jest.fn(),
    set: jest.fn(),
  };
}

function createChromeMock() {
  return {
    runtime: {
      id: undefined,
      lastError: undefined,
      getManifest: jest.fn(),
      getURL: jest.fn(),
      sendMessage: jest.fn(),
      connect: jest.fn(),
      openOptionsPage: jest.fn(),
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onConnect: createEvent(),
    },
    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
      session: createStorageArea(),
      onChanged: createEvent(),
    },
    tabs: {
      query: jest.fn(),
      sendMessage: jest.fn(),
      create: jest.fn(),
      onUpdated: createEvent(),
      onActivated: createEvent(),
    },
    i18n: {
      getMessage: jest.fn(),
      getUILanguage: jest.fn(),
    },
    contextMenus: {
      create: jest.fn(),
      removeAll: jest.fn(),
      onClicked: createEvent(),
    },
    commands: {
      onCommand: createEvent(),
    },
    sidePanel: {
      setPanelBehavior: jest.fn(),
      open: jest.fn(),
    },
  };
}

module.exports = { createChromeMock };
