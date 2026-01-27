# Omni AI

> 🧠 Your All-in-One AI Writing Assistant Chrome Extension. Supercharge your browser with the power of Google Gemini, Groq (Llama 3/Mixtral), OpenAI (GPT-4o), and Ollama (Local AI).

[![Version](https://img.shields.io/badge/version-1.7.1-blue)](https://github.com/ddtcorex/omni-ai)
[![License](https://img.shields.io/badge/license-GPLv3-blue)](LICENSE)
[![Chrome](https://img.shields.io/badge/chrome-extension-yellow)](#installation)

Omni AI is a modern, lightweight Chrome extension that integrates advanced AI models directly into your browsing experience. Whether you're drafting an email, writing code, or just browsing, Omni AI helps you improve your writing, explain complex topics, and translate text instantly.

---

## ✨ Features

### 🚀 Smart Selection Actions

Highlight any text on any website to see the **✨ Omni AI Floating Button**. One click gives you access to:

- **Fix Grammar & Spelling** - Professional polish in a click.
- **Rephrase** - Rewrite with different words for better flow.
- **Summarize** - Get the gist of long paragraphs instantly.
- **Change Tone** - Swiftly switch between Professional, Casual, Formal, and more.
- **Ask AI** - Direct chat contextually based on your selection.
- **Persistent Chat** - Popup chat retains history for multi-turn conversations.
- **Context Awareness** - AI remembers context from previous messages in the popup.

### 📋 Writing Enhancements

Dedicated tools for specific needs:

- **Improve Clarity** - Make your thoughts clearer.
- **Make Concise** - Cut the fluff.
- **Expand** - Elaborate with AI-generated depth.
- **Emojify** - Add the perfect emojis for social or chat.

### 📝 Rich Text & Input Support

- **Universal Compatibility**: Works on `input`, `textarea`, and rich text editors like **TinyMCE**.
- **Smart Replacement**: "Replace" button seamlessly updates content in complex editors.

### 🌍 Instant Translation & Explanation

- **Translate** - Supports 10+ languages including Spanish, French, German, Japanese, and Chinese.
- **Primary Language** - Set your native language (e.g., Vietnamese) for one-click instant translations.
- **Explain** - Simplifies difficult concepts, technical jargon, or complex paragraphs.

### 📊 Dashboard & Usage Statistics

Track your productivity with the new **Usage Dashboard**:

- Monitor **Total Actions** taken.
- See how many **Words Processed** and **Words Generated**.
- Clean, grid-based visualization for your AI activity.

### 🛠️ Premium Settings UI

- **Multiple AI Providers**: Support for **Google Gemini** (1.5 Flash, Pro, 2.0), **Groq** (Llama 3.3, DeepSeek R1, Mixtral, Gemma), and **OpenAI** (GPT-4o, GPT-4o Mini, GPT-3.5).
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

You can choose between Google Gemini, Groq, or OpenAI as your AI provider.

#### Option A: Google Gemini

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey).
2. Create a new API key.
3. In Omni AI, go to **Settings** > **AI Provider** and select **Google Gemini**.
4. Paste your key and save.

#### Option B: Groq (Llama 3 / Mixtral)

1. Go to [Groq Console](https://console.groq.com/keys).
2. Create a new API Key.
3. In Omni AI, select **Groq** as the provider.
4. Paste your key `gsk_...` and save.

#### Option C: OpenAI (GPT-3.5 / GPT-4)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys).
2. Create a new API Key.
3. In Omni AI, select **OpenAI** as the provider.
4. Paste your key `sk-...` and save.

#### Option D: Ollama (Local AI)

1. Ensure [Ollama](https://ollama.com/) is installed and running on your machine.
2. In Omni AI, go to **Settings** > **AI Provider** and select **Ollama**.
3. Set your endpoint (default: `http://localhost:11434`).
4. **Important**: You must configure Ollama to allow requests from the extension (CORS). See [Ollama CORS Configuration](#-ollama-cors-configuration) below.
5. **Specialized Models**: Omni AI supports specialized models like `TranslateGemma` for translations and `DeepSeek Coder` for technical tasks.

---

### 2. Custom Model Configuration

Omni AI allows you to use any model provided by your chosen AI provider, even if it's not in the default list.

#### How to use Custom Models

1. In **Settings**, find the **AI Model** dropdown.
2. Select the **"Custom Model..."** option for your preferred provider (e.g., _Groq Custom Model..._).
3. A new field **Custom Model Name** will appear.
4. Enter the Model ID provided by the AI platform (e.g., `gpt-4o-2024-08-06` for OpenAI).
5. Click **Save Settings**.

#### 🧠 Intelligent Model ID Resolution

Omni AI features a smart resolution system that maps common short names to their official API IDs. You can enter a simplified name, and the extension will automatically use the correct implementation:

- **Groq:** Entering `llama-3.1-8b` automatically maps to `llama-3.1-8b-instant`.
- **OpenAI:** Entering `gpt-4o` maps to the latest stable `gpt-4o` version.
- **Ollama:** Prefix `ollama-` is automatically handled if you enter a local model name.

#### Common Custom Model IDs

- **Groq:** `llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`, `mixtral-8x7b-32768`.
- **OpenAI:** `gpt-4o`, `gpt-4o-mini`, `o1-preview`.
- **Google:** `gemini-1.5-pro-latest`, `gemini-2.0-flash-exp`.

---

### 🛠 Ollama CORS Configuration

For the extension to communicate with your local Ollama server, you must set the `OLLAMA_ORIGINS` environment variable.

#### Linux (systemd)

1. Run `sudo systemctl edit ollama.service`
2. Add the following lines:

   ```ini
   [Service]
   Environment="OLLAMA_ORIGINS=*"
   ```

3. Restart Ollama:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

#### macOS

1. Quit Ollama from the menu bar.
2. Run in terminal:

   ```bash
   launchctl setenv OLLAMA_ORIGINS "*"
   ```

3. Restart the Ollama application.

#### Windows

1. Close Ollama from the system tray.
2. Open **Edit the system environment variables** in the Start menu.
3. Add a new **User variable**:
   - Variable: `OLLAMA_ORIGINS`
   - Value: `*`
4. Restart Ollama.

---

### 2. Google Sign-In (Optional)

To use the personalization features (syncing settings across devices), you need to configure OAuth.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Credentials**.
4. Create **OAuth client ID** > **Chrome extension**.
5. Detailed steps can be found in the [Chrome Identity API docs](https://developer.chrome.com/docs/extensions/reference/identity/).
6. Copy the `client_id` and paste it into `manifest.json`:

   ```json
   "oauth2": {
     "client_id": "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

7. (Recommended) Copy the `key` from the Developer Dashboard to `manifest.json` to keep the extension ID stable.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action                                       |
| :------- | :------------------------------------------- |
| `Alt+O`  | Open Omni AI Popup                           |
| `Alt+A`  | **Quick Ask** Overlay (Ask AI from any page) |
| `Alt+R`  | Rephrase (on selected text)                  |
| `Alt+T`  | Translate to Primary Language                |

_Shortcuts can be customized in `chrome://extensions/shortcuts`_

---

## 🌍 Multilingual Support

Omni AI currently supports 10 languages:

- 🇺🇸 English
- 🇻🇳 Vietnamese (Default)
- 🇪🇸 Spanish
- 🇫🇷 French
- 🇩🇪 German
- 🇮🇹 Italian
- 🇵🇹 Portuguese
- 🇯🇵 Japanese
- 🇰🇷 Korean
- 🇨🇳 Chinese

The language is automatically detected, but you can pin a **Primary Language** in Settings for quick translations.

---

## 📁 Project Structure

```text
omni-ai/
├── manifest.json        # Extension Manifest V3
├── background/          # Background service worker
│   └── service-worker.js
├── content/             # Injected scripts & UI
│   ├── content.js       # Core injection logic
│   └── overlay.css      # Floating buttons & popups
├── lib/                 # Shared logic & AI Providers
│   ├── ai-service.js    # AI Dispatcher
│   ├── history.js       # Statistics & History management
│   └── providers/       # AI Model Implementations
│       ├── gemini.js
│       ├── groq.js
│       ├── openai.js
│       └── ollama.js
├── assets/              # Branding & High-res icons
├── settings.html        # Main configuration page
├── settings.js
├── settings.css
├── popup/               # Extension Popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── scripts/             # Build & Utility scripts
    └── publish.sh       # Automates ID key removal & zipping
```

---

## 🛠️ Tech Stack

- **Manifest V3**: Using the latest Chrome extension standards.
- **Vanilla JavaScript**: Lightweight, no heavy frameworks, maximum performance.
- **Modern CSS**: Variables, Flex/Grid, Glassmorphism, and smooth animations.
- **Provider Architecture**: Easily extendable to add new AI providers (OpenAI, Anthropic, etc.).

---

## 📦 Publishing to the Chrome Web Store

Follow this guide to publish **Omni AI** to the official Chrome Web Store.

### 1. Prepare the Distribution Zip

First, you need to create a clean `.zip` file containing only the necessary files for the extension to run.

#### Automated Build Script (Recommended)

We provide a script that automatically handles versioning and removes the development `key` field (required for OAuth locally but forbidden on the Web Store).

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
2. **Store Listing**:
   - **Description**: Use text from this README.
   - **Icons**: Use `assets/icons/` (ensure 128x128 PNG is available or convert SVG).
   - **Screenshots**: Upload 1280x800 screenshots of the extension in action.
   - **Category**: Productivity or Search Tools.
3. **Privacy & Permissions**:
   - **Single Purpose**: "Unified writing assistant and productivity tool".
   - **Justification**: Explain `activeTab`, `storage`, `identity`, `contextMenus` usage clearly.
   - **Privacy Policy**: Link to your privacy policy (GitHub Pages or similar).

### Pro Tips for Approval

- **Screenshot Quality**: Use high-quality screenshots. Show the ✨ floating button and the Usage Dashboard.
- **Clear Description**: Clearly explain that users need an API key (Gemini, Groq, or OpenAI) to use the extension.
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

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by [ddtcorex](https://github.com/ddtcorex)
