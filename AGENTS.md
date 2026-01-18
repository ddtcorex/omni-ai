# AGENTS.md - Handbook for AI Coding Assistants

Welcome, fellow agent. This document provides the necessary context and guidelines for interacting with the **Omni AI** codebase. Follow these directives to ensure consistency, performance, and high-quality UI standards.

---

## 🎯 Core Directives

1.  **Stick to Vanilla**: This project explicitly avoids heavy frameworks (React, Vue, Tailwind). Use **Vanilla JavaScript (ES6+)** and **Modern CSS**.
2.  **Manifest V3 Compliance**: Always adhere to Chrome Extension Manifest V3 standards. Avoid deprecated V2 APIs.
3.  **UI Excellence**: The project uses a "Premium Glassmorphic" design. Always use defined **CSS Variables** in `settings.css` and `overlay.css` for any UI additions.
4.  **Provider Pattern**: When adding AI capabilities, follow the provider pattern in `lib/providers/`.
5.  **Safety First**: Ensure all user selections and text injections handle edge cases (Inputs, Textareas, ContentEditables).

---

## 🏗️ Architectural Overview

### 1. Message Protocol

The project relies on a strictly defined messaging system between the `background` (service-worker) and `content` scripts:

- `GET_SELECTION`: Content script returns current text selection.
- `SHOW_RESULT`: Background tells content script to display the AI response overlay.
- `REPLACE_SELECTION`: Background tells content script to swap selection with AI result.
- `WRITING_ACTION`: Content/Popup tells background to execute a specific AI prompt.

### 2. AI Service (`lib/ai-service.js`)

Central dispatcher that chooses between providers (Gemini or Groq) based on the user's saved settings.

- **Providers**: Located in `lib/providers/`. Every provider must export an `async generateContent(prompt, config)` function and handle its own API-specific request/response mapping.

### 3. Settings & Storage

Settings are stored in `chrome.storage.local`.

- Global settings: `apiKey`, `groqApiKey`, `apiModel`, `currentPreset`, `defaultLanguage`.
- Object-based settings: `settings: { autoClose, showNotifications }`.

---

## 🎨 UI & Design System

The design identity is defined by the CSS variables in root. Do NOT hardcode colors.

**Key Tokens:**

- `--accent-purple`: #8b5cf6 (Primary brand color)
- `--bg-secondary`: Glassmorphic card background.
- `--glass-bg`: Semi-transparent background for overlays.
- `--transition-normal`: 0.3s ease.

**Templates:**

- Use the `.omni-ai-overlay` class for on-page popups to maintain consistency with branding.
- The Settings page (`settings.html`) uses a grid-based dashboard for usage statistics.

---

## 🛠️ Common Operations

### Adding a New AI Provider

1. Create `lib/providers/[name].js`.
2. Implement `generateContent(prompt, config)`.
3. Register the provider in `lib/providers/index.js`.
4. Update `settings.html` and `settings.js` to include the new model/key inputs.

### Adding a Writing Action (e.g., "Simplify")

1. Add the action to `lib/ai-service.js` prompt logic (or dedicated provider logic).
2. Add the button to `content.js` in the `showQuickActionMenu` function.
3. Add the display name to `formatActionName` in `content.js`.
4. (Optional) Define a unique icon and default preset if needed.

---

## 🧪 Verification Checklist for Agents

- [ ] Does the change preserve the "No Framework" rule?
- [ ] Does the UI use the standard CSS variables?
- [ ] Are logs removed before finalizing (unless it's a critical error)?
- [ ] Does text replacement work in both standard text and `<textarea>` elements?
- [ ] Are i18n messages used if the change involves user-facing text?

---

_This guide is maintained by ddtcorex and the Antigravity AI agent._
