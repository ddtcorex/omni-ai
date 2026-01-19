# Omni AI

> 🧠 Your All-in-One AI Writing Assistant Chrome Extension. Supercharge your browser with the power of Google Gemini and Groq (Llama 3/Mixtral).

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/ddtcorex/omni-ai)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
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

### 📋 Writing Enhancements

Dedicated tools for specific needs:

- **Improve Clarity** - Make your thoughts clearer.
- **Make Concise** - Cut the fluff.
- **Expand** - Elaborate with AI-generated depth.
- **Emojify** - Add the perfect emojis for social or chat.

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

- **Dual AI Providers**: Support for **Google Gemini** (1.5 Flash, Pro, 2.0) and **Groq** (Llama 3.3, 3.1, Mixtral, Gemma).
- **Glassmorphic Design**: A sleek, modern settings page (`settings.html`) with smooth animations and high-resolution visuals.
- **Helper Tooltips**: Interactive instructions and links to help you get your API keys quickly.
- **Context Presets**: Tailor AI responses for Email, Chat, Social Media, Technical, or Academic contexts.

---

## 🚀 Installation

### Development Mode

1. **Clone the repository**:

   ```bash
   git clone https://github.com/ddtcorex/omni-ai.git
   cd omni-ai
   ```

2. **Setup in Chrome**:
   - Open Chrome and go to `chrome://extensions`.
   - Toggle **Developer mode** in the top right.
   - Click **Load unpacked**.
   - Select the `omni-ai` project folder.

---

## ⚙️ Configuration

To use Omni AI, you need your own API keys. The extension supports:

1. **Google Gemini**: Get your free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Groq**: Get a high-speed API key at [Groq Console](https://console.groq.com/keys).

Enter your keys in the **Settings** page accessible via the extension icon or right-click menu.

---

## ⌨️ Keyboard Shortcuts

- **Open Settings**: `Ctrl + Shift + O`
- **Quick Ask**: `Ctrl + Shift + A`
- **Fix Grammar**: `Ctrl + Shift + G`
- **Rephrase**: `Ctrl + Shift + R`

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
│   └── providers/       # Individual API implementations
│       ├── gemini.js
│       └── groq.js
├── assets/              # Branding & High-res icons
├── settings.html        # Main configuration page
├── settings.js
└── settings.css
```

---

## 🛠️ Tech Stack

- **Manifest V3**: Using the latest Chrome extension standards.
- **Vanilla JavaScript**: Lightweight, no heavy frameworks, maximum performance.
- **Modern CSS**: Variables, Flex/Grid, Glassmorphism, and smooth animations.
- **Provider Architecture**: Easily extendable to add new AI providers (OpenAI, Anthropic, etc.).

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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by [ddtcorex](https://github.com/ddtcorex)
