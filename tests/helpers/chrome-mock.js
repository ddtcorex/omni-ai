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
 * Methods, value properties and storage areas mirror jest-chrome's defaults
 * exactly: every method is a bare `jest.fn()` returning `undefined`,
 * `runtime.id` and `runtime.lastError` are `undefined`, and each storage area
 * is `{ clear, get, getBytesInUse, remove, set }` of `jest.fn()`s. Tests keep
 * configuring implementations themselves with `mockResolvedValue` /
 * `mockImplementation`, exactly as before.
 *
 * Events are the one deliberate departure: they track the listeners registered
 * through them, so `hasListener` / `hasListeners` answer truthfully and
 * `callListeners` (the idiom docs/superpowers/plans/2026-09-07-sidebar-chat-streaming.md
 * teaches for driving `chrome.runtime.onConnect`) works without reaching into
 * `addListener.mock.calls`. jest-chrome's argument-count validation on
 * `addListener` is intentionally not reproduced; no test here depends on it.
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
  const listeners = new Set();

  return {
    addListener: jest.fn((listener) => {
      listeners.add(listener);
    }),
    removeListener: jest.fn((listener) => {
      listeners.delete(listener);
    }),
    hasListener: jest.fn((listener) => listeners.has(listener)),
    hasListeners: jest.fn(() => listeners.size > 0),
    getListeners: jest.fn(() => Array.from(listeners)),
    clearListeners: jest.fn(() => {
      listeners.clear();
    }),
    callListeners: jest.fn((...args) => {
      for (const listener of listeners) listener(...args);
    }),
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
      // Plain writable property, like jest-chrome's; jest-chrome validated the
      // assigned shape, which no test here relies on.
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
