# Chrome Extension Dev Tooling — Speed Stack for Omni AI

> Researched & verified 2026-08-25 against npm registry metadata, GitHub releases/READMEs, and official docs (sources at bottom). Companion to `AGENTS.md` → "Dev Loop & Tooling".

## TL;DR

Omni AI is **zero-build vanilla JS** by directive. The fastest loop that **preserves** that:

1. **`web-ext run --target chromium`** → save-to-auto-reload dev server (no bundler).
2. **TypeScript as a checker only**: JSDoc + `tsc --checkJs` + `@types/chrome` — types without rewriting a single file.
3. **ESLint 10 flat config** + Prettier — correct browser/service-worker globals.
4. **Keep Jest + jest-chrome**, add **Playwright E2E** (headless extension testing now works).
5. Escape hatch if a build step is ever accepted: **CRXJS v2** (least invasive) or **WXT** (most batteries-included).

## 1. Build/HMR landscape (2025–2026)

| Tool | Vanilla-JS friendly | HMR / reload | Status (Aug 2026) | Verdict here |
|---|---|---|---|---|
| **WXT** (wxt.dev) | ✅ vanilla template; JS works | Dev browser w/ ext installed; HMR for pages, reload for bg/content | 🟢 v0.21.4, ~2.2M dl/mo, very active | Best option *if* bundling is ever OK; restructures to `entrypoints/*` |
| **CRXJS** `@crxjs/vite-plugin` | ✅ wraps existing manifest/layout | Native Vite HMR | 🟢 **v2 stable since 2025-06-10** (2.7.x), peers vite ^3–^8, ~1.64M dl/mo | Least-invasive build option; keeps current file layout |
| **Plasmo** | 🟡 React-centric DX | Partial | 🔴 Dormant (nothing since 2025-05) | Avoid new investment |
| **Extension.js** | ✅ ESNext template, content-script HMR claim | ✅ | 🟡 Active but tiny adoption (~22k dl/mo) | Solo-maintainer risk |
| **chrome-extension-cli** | — | ❌ | 🔴 Dead (2023) | Skip |

Note: WXT's comparison page calling CRXJS unmaintained predates CRXJS v2 stable — outdated.

## 2. No-build auto-reload (the path we use)

- **`web-ext` (Mozilla)** — watches source files and reloads the extension in each target on change; Chromium support via `--target chromium`, `--chromium-binary`, `--chromium-profile`. Caveat: Chrome does **not** re-inject content scripts into already-open tabs after an extension reload → SW/popup/options edits are fully automatic; content-script edits usually need one tab refresh.
- ❌ `crx-hotreload`: officially broken on MV3 per its own README (Chrome removed the background-page FS APIs it relied on).
- Vite-as-static-server alone adds nothing (extension pages load from disk).

## 3. Recommended setup

```bash
npm i -D web-ext typescript @types/chrome eslint@^10 globals eslint-config-prettier prettier @playwright/test
```

`package.json` scripts:

```json
{
  "dev": "web-ext run --target chromium --source-dir . --chromium-profile ./.webext-profile",
  "typecheck": "tsc --noEmit",
  "lint": "eslint . && web-ext lint",
  "e2e": "playwright test",
  "verify": "npm run typecheck && npm run lint && npm test"
}
```

Add `.webext-profile/` and `test-results/` to `.gitignore`. The pinned `manifest.json` `"key"` keeps the unpacked extension ID stable under web-ext too.

### Type checking without a rewrite

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"]
  },
  "include": ["lib/**/*.js", "background/**/*.js", "content/**/*.js", "popup/**/*.js", "settings.js"]
}
```

Annotate incrementally with JSDoc (`@param`, `@returns`, `@typedef`). Strict `checkJs` surfaces exactly the class of bug we shipped (storage-area mismatches, undefined fields) before runtime.

### ESLint flat config

```js
const globals = require("globals");
module.exports = [
  { ignores: ["dist/**", ".webext-profile/**", "coverage/**", "tests/**"] },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
];
```

`web-ext lint` adds manifest/schema sanity (Firefox-flavored — treat warnings about Chromium-only keys as advisory).

## 4. Testing upgrades

- **Keep Jest + jest-chrome + jsdom** — jest-chrome is still the standard `chrome.*` mock (sinon-chrome is legacy, last publish 2019).
- **Add Playwright E2E** — since Chrome/Edge removed `--load-extension` side-load flags from stable builds, Playwright loads extensions through its **bundled Chromium**, which also enables headless extension testing and keeps the MV3 service-worker handle alive across idle suspension:

```js
// e2e/extension.fixtures.js
import { chromium } from "@playwright/test";
import path from "node:path";

const extPath = path.resolve("."); // repo root IS the unpacked extension
export async function launchWithExtension() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", // required post flag-removal
    headless: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  return { context, sw };
}
```

First E2E targets (mirror the AGENTS.md smoke checklist): selection menu opens on a fixture page → `QUICK_ACTION` card renders inside the shadow root; settings round-trip persists `storage.local`/`storage.sync` keys; context-menu flow shows result card.

Alternatives: Puppeteer ≥25 has `puppeteer.launch({ enableExtensions: [path] })` / `browser.installExtension()`; WebDriverIO has first-party web-extension testing. Playwright covers our needs.

## 5. Publish automation (optional next step)

Keep `scripts/publish.sh` as source of truth (key strip + OAuth client swap). To automate store upload later:

- Official Chrome Web Store Publish API — developer.chrome.com/docs/webstore/using-api
- `chrome-webstore-upload-cli` (GoogleChromeLabs, v4.x)
- GitHub Action `mnao305/chrome-extension-upload` (zip + upload + publish on tags)
- If WXT is ever adopted, `wxt zip` + `wxt submit` replaces all of the above

Suggested CI gate: `npm run verify` on PRs; publish action on version tags.

## 6. Adoption snapshot (dl/month, Aug 2026)

vitest 363M · plasmo ≈2.25M (stale) · wxt ≈2.20M ↑ · @crxjs/vite-plugin ≈1.64M · web-ext ≈0.81M · jest-chrome ≈146k · Extension.js ≈22k · chrome-extension-cli ≈1.7k

## Sources

npm registry records (wxt, @crxjs/vite-plugin, plasmo, extension, chrome-extension-cli, web-ext, jest-chrome, sinon-chrome, @types/chrome) · github.com/wxt-dev/wxt · github.com/crxjs/chrome-extension-tools · github.com/PlasmoHQ/plasmo · github.com/extension-js/extension.js · github.com/dutiyesh/chrome-extension-cli · github.com/mozilla/web-ext + [extensionworkshop web-ext command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) · github.com/xpl/crx-hotreload (README banner) · github.com/extend-chrome/jest-chrome · [puppeteer PR #13824](https://github.com/puppeteer/puppeteer/pull/13824) · github.com/mnao305/chrome-extension-upload · github.com/GoogleChromeLabs/chrome-webstore-upload · [wxt.dev](https://wxt.dev/guide/installation) ([compare](https://wxt.dev/guide/resources/compare), [publishing](https://wxt.dev/guide/essentials/publishing), [unit-testing](https://wxt.dev/guide/essentials/unit-testing)) · [crxjs.dev/vite-plugin](https://crxjs.dev/vite-plugin) · [playwright.dev/docs/chrome-extensions](https://playwright.dev/docs/chrome-extensions) · [pptr.dev/guides/chrome-extensions](https://pptr.dev/guides/chrome-extensions) · [webdriver.io web-extension testing](https://webdriver.io/docs/extension-testing/web-extensions) · [CWS Publish API](https://developer.chrome.com/docs/webstore/using-api)
