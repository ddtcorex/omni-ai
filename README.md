# Omni AI

> 🧠 Your All-in-One AI Browser Companion. Supercharge your Chrome experience with the power of Google Gemini, OpenAI, Groq, Anthropic Claude, and Custom Gateway.

[![Version](https://img.shields.io/badge/version-2.4.0-blue)](https://github.com/ddtcorex/omni-ai)
[![License](https://img.shields.io/badge/license-GPLv3-blue)](LICENSE)
[![Chrome](https://img.shields.io/badge/chrome-extension-yellow)](#installation)

Omni AI is a modern, lightweight Chrome extension that integrates advanced AI models directly into your workflow. Whether you're **drafting emails, debugging code, reading foreign articles, or researching complex topics**, Omni AI helps you write better, read faster, and understand everything instantly.

---

## ✨ Features

### 🚀 Smart Selection Actions

Highlight any text on any website to see the **✨ Omni AI Floating Button**. One click gives you access to:

- **Fix Grammar & Spelling**: Professional polish in a click.
- **Rephrase**: Rewrite with different words for better flow.
- **Summarize**: Get the gist of long paragraphs instantly.
- **Change Tone**: Swiftly switch between the Professional, Casual, Friendly, Direct, and Confident presets.
- **Ask AI**: Direct chat contextually based on your selection (the Quick Ask overlay has no default shortcut; bind it at `chrome://extensions/shortcuts` if you want it on the keyboard).
- **Page Tools**: Click the toolbar icon to open a side panel with one-click Summarize / Smart Translate / Explain for the whole page you're on.
- **Sidebar Chat**: A streaming AI chat tab in the side panel: ask about the page you're viewing (auto page context, capped at ~8000 chars), with history and live token-by-token responses streamed over a `chrome.runtime` Port.

### 📋 Writing Enhancements

Dedicated tools for specific needs:

- **Improve Clarity**: Make your thoughts clearer.
- **Make Concise**: Cut the fluff.
- **Expand**: Elaborate with AI-generated depth.
- **Emojify**: Add the perfect emojis for social or chat.

### 📝 Rich Text & Input Support

- **Universal Compatibility**: Works on `input`, `textarea`, and rich text editors like **TinyMCE**.
- **Smart Replacement**: "Replace" button seamlessly updates content in complex editors.

### 🌍 Instant Translation & Explanation

- **Translate**: 43 languages, including Spanish, French, German, Hindi, Arabic, Japanese and both Simplified and Traditional Chinese. `lib/languages.js` holds the full list.
- **Primary Language**: Set your native language (e.g., Vietnamese) for one-click instant translations.
- **Explain**: Simplifies difficult concepts, technical jargon, or complex paragraphs.

### 📊 Dashboard & Usage Statistics

Track your productivity with the new **Usage Dashboard**:

- Monitor **Total Actions** taken.
- See how many **Words Processed** and **Words Generated**.
- Clean, grid-based visualization for your AI activity.

### 🛠️ Premium Settings UI

- **Multiple AI Providers**: Support for **Google Gemini** (3.6 Flash, 3.5 Flash Lite, 2.5 Pro), **OpenAI** (GPT-5.6 Luna, Terra, Sol), **Groq** (GPT-OSS 20B, Llama 3.3 70B, GPT-OSS 120B), **Anthropic Claude** (Haiku 4.5, Sonnet 5, Opus 5), and **Custom Gateway** (OpenAI-compatible).
- **Glassmorphic Design**: A sleek, modern settings page (`settings.html`) with smooth animations and high-resolution visuals.
- **Helper Tooltips**: Interactive instructions and links to help you get your API keys quickly.
- **Context Presets**: Tailor AI responses for Email, Chat, Social Media, Technical, or Academic contexts.

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/ddtcorex/omni-ai.git
cd omni-ai
```

### 2. Load into Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `omni-ai` directory.

---

## 🔑 Configuration

### 1. AI Provider Configuration (Required)

You can choose between Google Gemini, OpenAI, Groq, Anthropic Claude, or Custom Gateway as your AI provider.

#### Option A: Google Gemini

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey).
2. Create a new API key.
3. In Omni AI, go to **Settings** > **AI Model** and select a **Google Gemini** model.
4. Paste your key and save.

#### Option B: OpenAI (GPT-5.6)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys).
2. Create a new API Key.
3. In Omni AI, select an **OpenAI** model (GPT-5.6 Luna / Terra / Sol).
4. Paste your key `sk-...` and save.

#### Option C: Groq (fast inference)

1. Go to [Groq Console](https://console.groq.com/keys).
2. Create a new API Key.
3. In Omni AI, select a **Groq** model (GPT-OSS 20B, Llama 3.3 70B, GPT-OSS 120B).
4. Paste your key `gsk_...` and save.

#### Option D: Anthropic Claude

1. Go to [Anthropic Console](https://console.anthropic.com/settings/keys).
2. Create a new API Key.
3. In Omni AI, select an **Anthropic Claude** model (Haiku 4.5 / Sonnet 5 / Opus 5).
4. Paste your key `sk-ant-...` and save.

#### Option E: Custom Gateway

Connect to any OpenAI-compatible API endpoint (OpenRouter, LiteLLM, Together AI, your own proxy, etc.):

1. In Omni AI, select **Custom Gateway** from the model dropdown.
2. Enter your **Base URL** (e.g., `https://openrouter.ai/api/v1`, `https://your-gateway.com/v1`).
3. Enter your **API Key** (optional for some gateways).
4. Enter the **Model Name** (e.g., `anthropic/claude-sonnet-5`).
5. Click **Validate Configuration** to test.

---

### 2. Custom Model Configuration

Omni AI allows you to use any model provided by your chosen AI provider, even if it's not in the default list.

#### How to use Custom Models

1. In **Settings**, find the **AI Model** dropdown.
2. Select the **"Custom Model..."** option for your preferred provider (e.g., _OpenAI Custom Model..._).
3. A new field **Custom Model Name** will appear.
4. Enter the Model ID **exactly** as the AI platform documents it. It is sent to the provider verbatim, with no short-name expansion or fuzzy matching.
5. Click **Save Settings**.

#### Common Custom Model IDs

- **Groq:** `llama-3.1-8b-instant`, `deepseek-r1-distill-llama-70b`, `openai/gpt-oss-120b`.
- **OpenAI:** `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`.
- **Google:** `gemini-2.5-pro`, `gemini-3.6-flash`.
- **Anthropic Claude:** `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`.
- **Custom Gateway:** Varies by provider (e.g., OpenRouter: `anthropic/claude-sonnet-5`).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action                                                                         |
| :------- | :----------------------------------------------------------------------------- |
| `Alt+O`  | Show the Quick Actions menu at the current selection                           |
| `Alt+R`  | Rephrase (on selected text)                                                    |
| `Alt+T`  | Smart Translate (auto-detects direction between your two configured languages) |
| `Alt+F`  | Fix Grammar (on selected text)                                                 |

Chrome only auto-binds up to 4 shortcuts per extension, so these are the 4 with a default binding. Opening the side panel, Quick Ask, Summarize, and Explain are also available as commands but need to be bound manually, like all shortcuts here, at `chrome://extensions/shortcuts`.

---

## 🌍 Multilingual Support

Omni AI has two independent language settings: the languages you can **translate into**, and the language the **interface** is displayed in. They are not the same list, and you can mix them freely, for example running a Vietnamese interface while translating into Japanese.

### Translation languages (43)

`lib/languages.js` (`LANGUAGES`) is the single source of truth for this list. The Settings pickers render it behind a search box, grouped into Common and All, and the AI prompts read the language names from the same file.

Amharic, Arabic, Bengali, Chinese (Simplified), Chinese (Traditional), Czech, Danish, Dutch, English, Filipino, Finnish, French, German, Greek, Gujarati, Hausa, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Javanese, Korean, Malay, Marathi, Norwegian, Persian, Polish, Portuguese, Punjabi, Romanian, Russian, Spanish, Swahili, Swedish, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese.

The source language is never configured: the model infers it. Pin a **Primary Language** in Settings for one-click translations, and Smart Translate picks the direction for you (text in your primary language goes to your default language, anything else goes to your primary language).

### Interface languages (52)

The whole extension UI is localized, and Chrome selects the locale that matches your browser language automatically. The exact list is `UI_LOCALE_CODES` in `lib/languages.js`, and a test asserts it matches the `_locales/` directories on disk. Language **names** inside the pickers are the one deliberate exception: they come from the registry as reference data (each with an English and a native name) rather than being duplicated into every catalogue.

---

## 📁 Project Structure

```text
omni-ai/
├── manifest.json           # Extension Manifest V3
├── background/             # Background service worker
│   └── service-worker.js   # Message router, context menus, commands, side panel
├── content/                # Injected scripts & UI
│   ├── content.js          # Selection tracking, floating button, result cards
│   ├── editor-adapters.js  # input / textarea / contenteditable adapters
│   ├── positioning.js      # Viewport clamping helpers
│   └── overlay.css         # Styles injected into the Shadow DOM root
├── sidepanel/              # Side panel: Page Tools + streaming Chat tab
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
├── lib/                    # Shared logic & AI Providers
│   ├── ai-service.js       # AI Dispatcher and prompt builders
│   ├── ai-providers.js     # Provider & model registry
│   ├── languages.js        # Translation language registry (43 codes)
│   ├── i18n.js             # Shared i18n wrapper
│   ├── storage.js          # Typed owner of the Storage Map keys
│   ├── history.js          # Statistics & History management
│   ├── theme-manager.js    # Theme apply/broadcast
│   ├── sidebar-chat.js     # Chat prompt builder (page context + history)
│   ├── omni-chat-port.js   # Streaming chat Port handler ("omni-chat")
│   ├── design-tokens.css   # Canonical --omni-* custom properties
│   ├── design-system.css   # Shared .ds-* component classes
│   └── providers/          # AI Model Implementations
│       ├── gemini.js
│       ├── groq.js
│       ├── openai.js
│       ├── anthropic.js
│       └── custom-gateway.js
├── _locales/               # chrome.i18n catalogues (52 locales)
├── assets/                 # Branding & high-res icons
├── settings.html           # Main configuration page
├── settings.js
├── settings.css
├── tests/                  # Jest 30 + jsdom + shared chrome mock
├── e2e/                    # Playwright specs
└── scripts/                # Build & utility scripts
    └── publish.sh          # Strips the dev key and zips dist/
```

---

## 🛠️ Tech Stack

- **Manifest V3**: Using the latest Chrome extension standards.
- **Vanilla JavaScript**: Lightweight, no heavy frameworks, maximum performance.
- **Modern CSS**: Variables, Flex/Grid, Glassmorphism, and smooth animations.
- **Provider Architecture**: Easily extendable to add new AI providers. See `lib/providers/` and the `AI_PROVIDERS` registry.

---

## 🤝 Contributing & CI Gate

`master` is **branch-protected**: you cannot push to it directly, and a PR can
only merge when **both** GitHub checks are green (`verify` and `e2e (playwright)`)
and the branch is up to date with `master`. Contributors (human or AI agent)
must therefore run the local equivalent of the pipeline **before** pushing:

```bash
npm run verify          # typecheck + ESLint + Prettier --check + Jest coverage
npx playwright test     # E2E: extension loads in MV3, side panel, smoke
```

- Never push a known-red state and rely on CI to catch it. Fix locally and
  re-run until both commands are green.
- Keep your feature branch rebased/up to date with `master` so the
  "up-to-date before merge" check passes.
- Exact CI invocations live in `.github/workflows/ci.yml`. Treat that file as
  the source of truth for what the gate runs.

See `AGENTS.md` ("Pre-Push Gate") for the full agent checklist that mirrors this
pipeline.

---

## 📦 Publishing to the Chrome Web Store

Follow this guide to publish **Omni AI** to the official Chrome Web Store.

### 1. Prepare the Distribution Zip

First, you need to create a clean `.zip` file containing only the necessary files for the extension to run.

#### Automated Build Script (Recommended)

We provide a script that automatically handles versioning and removes the development `key` field (used locally to keep a stable extension ID, but forbidden on the Web Store).

```bash
# Make the script executable (first time only)
chmod +x scripts/publish.sh

# Run the build script
./scripts/publish.sh
```

This will create `omni-ai-vX.X.X.zip` in the root directory, ready for upload.

### 2. Create a Developer Account

To publish on the Chrome Web Store, you need a Google Developer account.

1. Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2. Sign in with your Google Account.
3. Pay the one-time **$5 USD** developer registration fee.
4. Complete your developer profile.

### 3. Upload and Configure

1. **Upload**: Click **+ New Item** and upload your `.zip`.
2. **Store Listing**: paste the text from `docs/CHROME_WEBSTORE_LISTING.txt`, which
   holds the description field as well as the remaining dashboard fields
   (product name, summary, category, languages, single purpose, screenshots).
   - **Icons**: Use `assets/icons/` (ensure 128x128 PNG is available or convert SVG).
   - **Screenshots**: Upload 1280x800 screenshots of the extension in action.
   - **Category**: Productivity or Search Tools.
3. **Privacy & Permissions**: paste the permission justifications and the data
   collection answers from `docs/PERMISSION_JUSTIFICATIONS.txt`, and link the
   published copy of `docs/PRIVACY_POLICY.md`.

### Pro Tips for Approval

- **Screenshot Quality**: Use high-quality screenshots. Show the ✨ floating button and the Usage Dashboard.
- **Clear Description**: Clearly explain that users need an API key (Gemini, OpenAI, Groq, Anthropic Claude) or Custom Gateway to use the extension.
- **Permission Scope**: Chrome reviewers prefer the narrowest permissions possible.

---

## 🤝 Contributing

Contributions are welcome! Whether it's fixing a bug, adding a new feature, or improving documentation:

1. **Fork** the repository.
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`.
3. **Commit your changes**: `git commit -m 'feat: add amazing feature'`.
4. **Push to the branch**: `git push origin feature/amazing-feature`.
5. **Open a Pull Request**.

### Coding Guidelines

- Use **Vanilla JavaScript** (ES6+). Avoid adding external frameworks or heavy libraries.
- Maintain the **CSS Variable** system for styling.
- Ensure any new AI providers follow the existing pattern in `lib/providers/`.

---

## 📄 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by [ddtcorex](https://github.com/ddtcorex)
