# Omni AI - Setup & User Guide

## 🚀 Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/ddtcorex/omni-ai.git
   cd omni-ai
   ```

2. **Load into Chrome**:
   - Open Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** (top right toggle).
   - Click **Load unpacked**.
   - Select the `omni-ai` directory.

## 🔑 Configuration

### 1. Gemini API Key (Required)

To use the AI features, you need a Google Gemini API key.

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey).
2. Create a new API key.
3. In Omni AI, click the **Settings** icon (top right of popup).
4. Paste your key into the **Gemini API Key** field and save.

### 2. Google Sign-In (Optional)

To use the personalization features (syncing settings across devices), you need to configure OAuth.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Navigate to **APIs & Services > Credentials**.
4. Create **OAuth client ID** > **Chrome extension**.
5. detailed steps can be found in the [Chrome Identity API docs](https://developer.chrome.com/docs/extensions/reference/identity/).
6. Copy the `client_id` and paste it into `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```
7. (Recommended) Copy the `key` from the Developer Dashboard to `manifest.json` to keep the extension ID stable.

## ⌨️ Keyboard Shortcuts

| Shortcut       | Action                                       |
| -------------- | -------------------------------------------- |
| `Ctrl+Shift+O` | Open Omni AI Popup                           |
| `Ctrl+Shift+A` | **Quick Ask** Overlay (Ask AI from any page) |
| `Ctrl+Shift+G` | Fix Grammar (on selected text)               |
| `Ctrl+Shift+R` | Rephrase (on selected text)                  |

_Shortcuts can be customized in `chrome://extensions/shortcuts`_

## 🌍 Multilingual Support

Omni AI currently supports:

- 🇺🇸 English (Default)
- 🇻🇳 Vietnamese

The language is automatically detected based on your browser settings.

## 🛠 Features

- **Writing Improvements**: Fix grammar, improve clarity, change tone, make concise, expand, or rephrase.
- **Quick Actions**: Translate, summarize, reply, or emojify text in one click.
- **Context Presets**: Tailor AI responses for Email, Chat, Social, Technical, or Academic writing.
- **Custom Prompts**: Create and save your own prompt templates.
- **Usage History**: Track your AI usage and statistics locally.
