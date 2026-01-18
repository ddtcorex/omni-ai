# Omni AI

> 🧠 All-in-One AI Assistant Chrome Extension powered by Google Gemini

![Version](https://img.shields.io/badge/version-0.1.0--dev-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Chrome](https://img.shields.io/badge/chrome-extension-yellow)

## ✨ Features

### Writing Enhancement

- **Fix Grammar & Spelling** - Correct errors while preserving meaning
- **Improve Clarity** - Make text clearer and easier to understand
- **Change Tone** - Professional, Casual, Friendly, Formal, Assertive
- **Make Concise** - Shorten without losing meaning
- **Expand** - Add more detail and depth
- **Rephrase** - Rewrite with different words

### Context Presets

- 📧 **Email** - Professional communication
- 💬 **Chat** - Casual messaging (Slack, Discord, WhatsApp)
- 🐦 **Social** - Twitter/X, LinkedIn posts
- 📝 **Technical** - Documentation, code comments
- 📚 **Academic** - Formal writing, research

### Quick Actions

- **Translate** - Translate to any language
- **Summarize** - Get key points from long text
- **Generate Reply** - AI-suggested responses
- **Explain** - Simplify complex text
- **Emojify** - Add relevant emojis

### AI Utilities

- **Quick Ask** - Ask Gemini anything via popup
- **Explain Selection** - Highlight text → get explanation
- **Code Helper** - Explain/fix/improve code snippets
- **Custom Prompts** - Save your own prompt templates

## 🔐 Authentication

Omni AI uses Google Sign-In for seamless authentication, keeping your settings synced across devices.

## 🚀 Installation

### Development

```bash
# Clone the repository
git clone https://github.com/ddtcorex/omni-ai.git
cd omni-ai

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select this directory
```

### Chrome Web Store

> Coming soon...

## 📁 Project Structure

```
omni-ai/
├── manifest.json          # Chrome Extension Manifest V3
├── popup/                  # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                # Content scripts (injected into pages)
│   ├── content.js
│   └── overlay.css
├── background/             # Service worker
│   └── service-worker.js
├── options/                # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── lib/                    # Shared utilities
│   ├── gemini-api.js
│   ├── auth.js
│   └── prompts.js
└── assets/                 # Icons and images
    └── icons/
```

## 🛠️ Tech Stack

- **Chrome Extension Manifest V3**
- **Google Gemini API** - AI capabilities
- **Google OAuth 2.0** - Authentication
- **Vanilla JS/CSS** - No frameworks, fast & lightweight

## 📋 Roadmap

See [GitHub Issues](https://github.com/ddtcorex/omni-ai/issues) for detailed roadmap.

### Milestones

- [ ] **v0.1.0** - Foundation (Setup, Auth, API)
- [ ] **v0.2.0** - Core Features (Popup, Text Selection, Improvements)
- [ ] **v0.3.0** - Enhanced UX (Presets, Custom Prompts, Settings)
- [ ] **v1.0.0** - Polish (History, Shortcuts, i18n)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with ❤️ by [ddtcorex](https://github.com/ddtcorex)
