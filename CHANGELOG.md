# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Editor adapter registry for standard inputs, contenteditable composers, open Shadow DOM, and TinyMCE iframe documents.
- Frame-aware keyboard-command routing for active editors.
- Settings control for the floating Omni AI button; it is enabled by default and shortcuts remain available when disabled.
- Translations for the new floating-button settings strings across all 10 locales.
- Default Alt+F shortcut for Fix Grammar. Chrome only auto-binds up to 4 declared `suggested_key` shortcuts per extension, so the popup-open shortcut (`_execute_action`, previously Alt+O) was dropped to make room — the popup is still reachable via the toolbar icon or `chrome://extensions/shortcuts`. Shortcuts now auto-bound on install: Alt+A (quick ask), Alt+R (rephrase), Alt+T (translate), Alt+F (grammar). Summarize/Explain remain declared without a default and must be bound manually. See `docs/FOLLOWUPS.md` #8 for a Playwright-test-harness quirk found while verifying this (resolved by staying at exactly 4 shortcuts, but worth reading before adding a 5th).
- Reordered and expanded the right-click context menu to Translate / Rephrase / Add Emoji / Summarize / Ask Omni AI, replacing the previous Improve/Explain/Translate set. "Ask Omni AI" opens the Quick Ask overlay (same as Alt+A) instead of running a fixed AI action.

### Fixed

- Keyboard-shortcut and context-menu actions (translate, rephrase, grammar, explain, summarize, quick ask) no longer broadcast `GET_SELECTION`/`SHOW_RESULT` to every frame on the page when no editor frame is being tracked; they now target the top frame explicitly. The broadcast form raced against any other frame on the page (ads, embeds) and could silently return an unrelated frame's empty selection instead of the real one.
- Long unbroken tokens (URLs, code) in an AI result or the auto grammar-check suggestion card now wrap inside their card instead of forcing it wider than the overlay and spilling outside its boundary.
- Added a `:host` reset inside `content/overlay.css` as a second isolation layer: previously the shadow host's page-CSS isolation depended entirely on a one-time inline style written by `content.js`, which a host page's own script could strip (a full DOM reset, an attribute-cleanup script) and let its own styles leak into the Omni AI UI through inheritance.
- The Alt+T "Dịch"/Translate keyboard shortcut now uses the same direction-detecting `smartTranslate()` as the on-page "Smart Translation" card, instead of always force-translating into the primary language regardless of the source text's language. `processSelectedText()` (shared by keyboard shortcuts and the right-click context menu) never had a `smart_translate` case, so the shortcut fell back to the one-way `translate_primary` action.
- The right-click "Dịch với Omni AI" context-menu item now also uses `smartTranslate()` instead of always translating to the default language, matching the shortcut and menu-card fix above.
- `chrome.runtime.onInstalled`'s `"update"` branch was an empty no-op, so reloading the unpacked extension (routine during development, and any real auto-update) never recreated the right-click context menu items that Chrome clears on reload, and never re-ran the settings-default merge for keys added after a user's original install. Both now run on `"update"` too, not just `"install"`.

## [2.1.0] - 2026-05-28

### ✨ Added

- **Custom Gateway Support**: Connect to any OpenAI-compatible API endpoint, including custom deployments and third-party providers like DeepSeek v4 Pro.

### 🛠 Improvements

- **Simple Language**: Prompts now emphasize using everyday, common vocabulary for more natural results.
- **Rephrase Freshness**: Rephrase action now bypasses cache for always-fresh results on each click.
- **Tone Presets**: Fixed tone action to correctly apply professional/casual/friendly/direct/confident presets.

### 🐛 Bug Fixes

- **Custom Gateway Provider Resolution**: Fixed issue where Custom Gateway provider was incorrectly routing to Gemini when using custom model names.
- **SSE Streaming Parser**: Fixed parsing for non-standard SSE response formats (common with proxy/gateway providers).

## [2.0.0] - 2026-02-23

### ✨ Added

- **Shadow DOM Isolation**: The extension UI now uses Shadow DOM for style isolation, which prevents host website styles from breaking the Omni AI overlay and vice-versa. This ensures a consistent look and feel across all web pages.
- **Improved Persistence**: The popup chat now intelligently persists draft input and maintains active page-context sessions during multi-tasking, preventing accidental loss of context when switching tabs or windows.

### 🛠 Improvements

- **Refined Rephrasing**: Updated the "Rephrase" prompt logic to provide more natural and concise results while reducing output variance for a more predictable experience.

## [1.9.0] - 2026-02-03

### ✨ Added

- **Smart Translation**: Introduced intelligent "Smart Translation" which automatically detects the input language and translates it to your Primary Language (or English if already in Primary), streamlining the user flow.
- **Result Caching**: Implemented in-memory caching for Smart Translations, providing instant results for previously translated text within the same session.
- **Page Context**: Quick Ask now includes page context (Title, URL) for better AI awareness.
- **Gemini 2.x Models**: Updated Google AI provider to support the latest `Gemini 2.0 Flash`, `Gemini 2.5 Flash`, and `Gemini 2.5 Flash Lite` models.

### 🛠 Improvements

- **Formatting Preservation**: Strictly preserves original text formatting (paragraphs, lists, spacing) in translations and grammar fixes.
- **Loading State**: Updated loading labels to be more generic ("Smart Translation...") to avoid confusion before language detection is complete.
- **Localization**: Added full localization for new features and improved "To [Language]" menu labels.
- **Formatted Diff**: Improved the "diff" view for grammar fixes to correctly handle and display line breaks.

### 🐛 Bug Fixes

- **Input Replacement**: Fixed a critical bug where Quick Actions would append text instead of replacing it when no text was selected in standard input fields.
- **Dead Code Removal**: Cleaned up unused translation keys and legacy parameter logic in the UI code.

## [1.8.2] - 2026-01-29

### 🛠 Improvements

- **Popup UI**: Added margin to the "New Chat" button in the popup header for better spacing.

### 🐛 Bug Fixes

- **Extension Context**: Implemented validation checks for extension context to prevent crashes and error noise when the extension is updated or reloaded.
- **Robust Storage**: Enhanced storage access logic to gracefully handle session expiration or context invalidation.

## [1.8.1] - 2026-01-27

### ✨ Added

- **Mouse Cursor Positioning**: The Quick Action button now appears exactly at the mouse cursor position where you stop selecting text. This applies to all contexts, including static text, rich text editors (TinyMCE), and input fields.

### 🛠 Improvements

- **Smaller Button Size**: Reduced the Quick Action button size from 26px to 22px to be less intrusive.
- **Semi-transparent UI**: The floating button is now semi-transparent (75% opacity) by default, becoming fully solid on hover for a more subtle user experience.

## [1.8.0] - 2026-01-27

### ✨ Added

- **Top 3 Models + Custom**: Streamlined AI model selection by restricting each provider (Google, Groq, OpenAI, Ollama) to their top 3 best-performing models plus a dedicated "Custom Model" option.
- **Improved Model ID Parsing**: Enhanced logic to correctly handle model IDs with prefixes (e.g., `openai/gpt-oss-120b`), ensuring compatibility with a wider range of custom models.
- **New Groq Models**: Updated Groq provider to support `Llama 3.3 70B`, `Llama 3.1 8B`, and `GPT-OSS 120B`.

### 🛠 Changed

- **Cleaned Up Model Lists**: Removed deprecated or less performant models to reduce clutter and simplify user choice.
- **Documentation Update**: Updated `README.md` to reflect the refined list of supported AI models.

## [1.7.1] - 2026-01-26

### 🐛 Fixed

- **Overlay Cut-off**: Implemented safety limits to prevent the overlay from expanding beyond the viewport height.
- **Scroll Containment**: Added `overscroll-behavior: contain` to prevent overlay scrolling from affecting the main page.
- **Responsive Layout**: Updated content areas to have responsive maximum heights (60vh) for better usability on all screens.

## [1.7.0] - 2026-01-26

### ✨ Added

- **Custom Model Support**: Users can now manually enter custom model names for all AI providers (Google Gemini, Groq, OpenAI, and Ollama).
- **Intelligent Model ID Resolution**: The extension now smartly maps shorter names (like `llama-3.1-8b`) to the correct API implementation IDs (like `llama-3.1-8b-instant`).

### 🛠 Improvements

- **Uniform AI Naming**: Replaced "Gemini" with generic "AI" labeling across all settings for a vendor-neutral experience.
- **Enhanced Localization**: All new settings, custom model inputs, and placeholders are localized in 10 languages.
- **Visual Refinement**: Centered the version badge in the settings header for a more balanced layout.
- **Dynamic Placeholders**: Placeholders for API keys and custom models are now automatically localized based on your language settings.

## [1.6.0] - 2026-01-26

### ✨ Added

- **Persistent Chat**: The popup chat now retains history until you clear it, allowing for multi-turn conversations with context awareness.
- **Context-Aware Replies**: AI now understands the conversation history (last 10 messages) for better responses.
- **Auto-Translation**: Selecting text (non-editable) now automatically triggers a translation card "Translated to [Primary Language]".
- **Keyboard Navigation**: Added keyboard support for the overlay trigger (`Ctrl+A`, `Shift+Arrow`).

### 🛠 Improvements

- **Localization**: Complete localization support for all UI elements, including new chat features, in 10 languages.
- **Visual Polish**: Replaced simple result box with a chat bubble interface in the popup.
- **UX Refinement**: "New Chat" button added to the popup header for easy reset.
- **Input logic**: Restrict overlay trigger to only appear on valid text inputs/textareas to avoid annoyance.

## [1.5.0] - 2026-01-26

### ✨ Added

- **Premium UI Overhaul**: Completely redesigned the overlay with a modern glassmorphic look, including a refined "Quick Ask" interface.
- **Smart Positioning**: The overlay now intelligently positions itself at the right edge of your selection, preferring to grow to the left to avoid screen edges.
- **Contextual Ask**: "Quick Ask" (`Alt+A`) now displays the selected text context while you type your question.
- **Input Field Power-Up**: Full support for `input` and `textarea` fields, including a "Replace" button that works seamlessly with keyboard shortcuts.
- **Auto-Selection**: When no text is selected in a focused input field, Omni AI automatically processes the entire field content.

### 🛠 Changed

- **Unified Result View**: Custom questions asked from the main menu now display results directly in the standard result overlay.
- **Visual Synchronization**: Synced the arrow buttons and icons across the entire UI for a more premium, cohesive feel.
- **Improved Diff View**: Added support for "Clarity" and "Improve" actions to show visual differences.

### 🛠 Improvements

- **Performance**: Removed debug logs and optimized message handling between scripts.
- **UX Polish**: Added vertical centering for action buttons in input wrappers.

## [1.4.1] - 2026-01-24

### 🛠 Improvements

- **Ollama Documentation**: Added detailed setup instructions for Linux, macOS, and Windows in README.
- **Error Handling**: Enhanced Ollama provider to catch 403 Forbidden errors and provide helpful CORS configuration hints.
- **Project Structure**: Updated documentation to reflect the inclusion of the Ollama provider.

### 🐛 Bug Fixes

- Fixed stale documentation regarding AI provider implementations.

## [1.4.0] - 2026-01-24

### ✨ Added

- **Ollama Integration**: Full support for local AI models via Ollama.
- **New Ollama Models**: Added specialized support for `TranslateGemma`, `Llama 3.2`, `Mistral NeMo`, `DeepSeek Coder V2`, and more.
- **Refined Input Triggers**: Overlay icon now only appears for text-based inputs and textareas, excluding checkboxes and select boxes.
- **Double-Click Support**: Improved selection handling to trigger actions on double-click within input fields.

### 🛠 Changed

- **UI Update**: Expanded settings page to support Ollama endpoint configuration and model selection.
- **API permissions**: Updated `manifest.json` to allow connections to local Ollama server.

## [1.3.1] - 2026-01-20

### 🐛 Fixed

- **Settings Logic**: Fixed issue where `primaryLanguage` was not persisting correctly.
- **Shortcut Behavior**: Corrected `Alt+T` to translate text to Primary Language (defaulting to Vietnamese).
- **Settings Cleanup**: Removed unimplemented "Auto-close" and "Notifications" toggles.

### 🛠 Changed

- **UI Sync**: Synchronized the order of "Translation Language" dropdown to match "Primary Language".
- **Defaults**: Explicitly set Primary Language default to Vietnamese.

## [1.3.0] - 2026-01-20

### ✨ Added

- **Smart Anchoring**: Result popup now "anchors" to the exact position of the menu, eliminating jarring visual jumps when content loads.
- **Back Navigation**: Added a back button (`<`) to the result overlay, allowing users to return to the quick action menu without re-selecting text.

### 🐛 Fixed

- **Visual Stability**: Resolved issue where the popup would "flip" from below to above the selection during loading.
- **Cleanup**: Removed unused `custom-prompts.js` file to reduce extension size.

## [1.2.0] - 2026-01-19

### ✨ Added

- **New Icons**: Introduced a clean, minimalist logo featuring a brain and circle motif representing "Omni" and AI intelligence.
- **Store Assets**: Included full set of optimized PNG icons (16, 48, 128px) for Chrome Web Store publishing.
- **Icon Generation**: Added automated script to generate consistent icons from SVG source.

### 🛠 Changed

- **Manifest**: Updated manifest.json to use the new PNG icons for better compatibility across all Chrome surfaces.

## [1.1.0] - 2026-01-19

### 🛠 Changed

- **Visual Polish**: Updated popup animation to match the floating icon's "pop-in" effect for a seamless experience.
- **UI Refinement**: Resized floating icon to 22px and restored its rounded shape.
- **Content Display**: Limited result popup height to 400px with automatic scrolling for better usability on small screens.

### 🐛 Fixed

- **Scroll Behavior**: Fixed issue where scrolling inside long content would accidentally close the popup.
- **Popup Positioning**: Fixed positioning logic to prevent the popup from being cut off by the screen edges and switched to fixed positioning for better stability.

## [1.0.0] - 2026-01-19

Initial stable release of Omni AI.

### ✨ Added

- **Core AI Integration**: Seamlessly connect to Google Gemini and Groq (Llama 3, Mixtral).
- **Selection Actions**: Floating ✨ icon for instant Grammar Fix, Rephrase, Summarize, and Tone changes.
- **Quick Ask**: Powerful contextual chat with AI based on selected text or input contents.
- **Primary Language**: Configure a primary language for streamlined one-click translations.
- **Explain Feature**: Dedicated quick action to break down complex text or jargon.
- **Usage Dashboard**: Real-time tracking of actions taken and tokens/words processed.
- **Theme Support**: Premium Light and Dark modes with glassmorphic UI.
- **Keyboard Shortcuts**: Power-user support for all major features.

### 🛠 Changed

- **Visual Overhaul**: Switched to high-fidelity SVG branding and modern glassmorphic design system.
- **Optimized UI**: Compact overlay menu and high-performance popup layout.
- **Provider Refactor**: Centralized model management for Llama 3.3, Gemini 2.0, and more.

### 🐛 Fixed

- Improved text selection handling for contenteditable fields and inputs.
- Resolved various race conditions in the background service worker.
- Fixed extension context invalidation errors during updates.
